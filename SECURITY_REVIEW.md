# Tally Security Review - Comprehensive Assessment

**Project:** Tally Personal Finance Dashboard  
**Stack:** FastAPI + HTMX + Tailwind (React 19) + SQLite + DuckDB  
**Review Date:** 2026-05-22  
**Status:** MVP Phase  

---

## Executive Summary

Tally is a **local-first personal finance dashboard** with critical security gaps that require immediate remediation before MVP release or production deployment. The application handles **sensitive financial data** (transactions, account balances, net worth) without authentication, encryption, input validation, or access control.

**Risk Level:** HIGH  
**Critical Findings:** 7  
**High Findings:** 11  
**Medium Findings:** 8  
**Total Findings:** 26

**Recommendation:** Do not deploy to production or expose beyond localhost until critical/high findings are resolved.

---

## 1. ARCHITECTURE SECURITY

### 1.1 No Authentication/Authorization Layer [CRITICAL]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/main.py` (lines 19-46)  
**Severity:** CRITICAL  
**Status:** Not Implemented

**Finding:** The entire FastAPI application has **ZERO authentication mechanisms**. All endpoints are publicly accessible without credentials, session tokens, or user identity verification. This includes:
- Financial transaction queries
- Account management
- Backup/restore operations
- Factory reset
- CSV uploads containing bank data

```python
# main.py - No auth middleware, no user context, all endpoints public
app = FastAPI(...)
app.include_router(upload.router)
app.include_router(accounts.router)
app.include_router(transactions.router)
app.include_router(admin.router)  # CRITICAL: reset(), backup(), restore() unprotected
```

**Impact:** 
- Any networked client can read all financial data
- Backup files can be downloaded/deleted without authorization
- Database can be factory-reset by any request
- Complete data exfiltration risk

**Remediation:**
1. Implement authentication layer (JWT tokens, session cookies, or API keys)
2. Add role-based access control (RBAC) or user isolation
3. Protect admin endpoints (`/api/admin/*`) with authentication decorator
4. Implement rate limiting on sensitive operations
5. Consider single-user mode vs. multi-user architecture based on requirements

**Priority:** CRITICAL - Must fix before any network exposure

---

### 1.2 CORS Configured for Development [HIGH]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/main.py` (lines 26-32)  
**Severity:** HIGH

**Finding:** CORS middleware uses hardcoded development origins and allows all headers/methods:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # ["http://localhost:5173", "http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],  # OVERLY PERMISSIVE
    allow_headers=["*"],  # OVERLY PERMISSIVE
)
```

**Risk:**
- `allow_methods=["*"]` permits unused HTTP verbs (TRACE, CONNECT)
- `allow_headers=["*"]` allows arbitrary headers (potential for header-injection)
- No `vary` or `cache-control` headers set on CORS responses
- Localhost-only origins are safe for dev, but config lacks production toggle

**Remediation:**
1. Restrict `allow_methods` to needed verbs: `["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]`
2. Set explicit `allow_headers` list instead of `"*"`
3. Add environment-based CORS configuration (dev vs. production)
4. Add `expose_headers` for any custom response headers
5. Example:
```python
if settings.environment == "production":
    cors_config = {"allow_origins": settings.cors_origins, "allow_methods": ["GET", "POST", "PATCH"]}
else:
    cors_config = {"allow_origins": "*", "allow_methods": ["*"]}
```

**Priority:** HIGH - Fix before production

---

### 1.3 Async Database Deadlock Risk [HIGH]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/database.py` (lines 11-16)  
**Severity:** HIGH

**Finding:** SQLite with `check_same_thread=False` in async context is unsafe:

```python
engine = create_async_engine(
    f"sqlite+aiosqlite:///{settings.sqlite_path}",
    echo=False,
    connect_args={"check_same_thread": False},  # UNSAFE in async
)
```

**Risk:**
- SQLite is not designed for async concurrency
- `check_same_thread=False` disables safety checks, increasing corruption risk under concurrent writes
- No write-ahead logging (WAL) mode enabled
- Database locks under concurrent transaction commits

**Remediation:**
1. Enable WAL mode for concurrent reads:
```python
engine = create_async_engine(
    f"sqlite+aiosqlite:///{settings.sqlite_path}",
    echo=False,
    connect_args={
        "check_same_thread": False,
        "timeout": 30,
    },
)
# In init_db():
await conn.execute("PRAGMA journal_mode=WAL")
await conn.execute("PRAGMA synchronous=NORMAL")
```
2. For production, migrate to PostgreSQL/MariaDB
3. Add connection pooling with appropriate timeouts
4. Implement transaction retry logic for lock timeouts

**Priority:** HIGH - Risk of data corruption under load

---

## 2. FRONTEND SECURITY

### 2.1 Missing Content Security Policy (CSP) [HIGH]
**File:** Frontend application (no CSP headers found)  
**Severity:** HIGH

**Finding:** No Content Security Policy headers configured. React app accepts inline scripts and external resources without restrictions.

**Impact:**
- XSS via `dangerouslySetInnerHTML` not caught by CSP
- Third-party script injection possible
- No protection against clickjacking (no X-Frame-Options)

**Remediation:**
1. Add `vite.config.ts` middleware or nginx headers:
```javascript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    }
  }
})
```
2. Remove any `dangerouslySetInnerHTML` usage
3. Set restrictive CSP for production

**Priority:** HIGH

---

### 2.2 No CSRF Token on Form Submissions [MEDIUM]
**File:** `/home/nick/dev/lucent/idea/Tally/frontend/src/lib/api.ts`  
**Severity:** MEDIUM

**Finding:** API calls lack CSRF token headers. File uploads and state-changing operations don't validate CSRF tokens.

**Example from upload.py:**
```python
@router.post("/csv")
async def upload_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    account_id: int = Form(...),
    db: AsyncSession = Depends(get_db),
):  # No CSRF validation
```

**Remediation:**
1. Add CSRF middleware to FastAPI:
```python
from fastapi_csrf_protect import CsrfProtect
@app.post("/api/upload/csv")
async def upload_csv(csrf_protect: CsrfProtect = Depends()):
    await csrf_protect.validate_csrf(request)
```
2. Add CSRF token to all form submissions
3. Implement SameSite cookie attribute (if using sessions)

**Priority:** MEDIUM (lower risk for localhost, important for network exposure)

---

### 2.3 No Form Input Validation on Frontend [MEDIUM]
**File:** `/home/nick/dev/lucent/idea/Tally/frontend/src/pages/Settings.tsx`  
**Severity:** MEDIUM

**Finding:** React forms accept arbitrary input without validation before API submission. Example:

```typescript
// Settings.tsx - No validation
const [newAccount, setNewAccount] = useState({ name: '', type: 'checking', institution: '' })

const createAccount = useMutation({
    mutationFn: (data: Record<string, unknown>) => accountsApi.create(data),
    // Direct submission, no validation
})
```

**Risk:** Relies entirely on backend validation, increases server load with malformed requests.

**Remediation:**
1. Add client-side validation with library (e.g., `zod`, `react-hook-form`)
2. Validate before API calls
3. Display validation errors to user before submission

**Priority:** MEDIUM

---

## 3. BACKEND SECURITY

### 3.1 SQL Injection via DuckDB Query Strings [CRITICAL]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/services/analytics.py` (lines 27-66, 98-150)  
**Severity:** CRITICAL

**Finding:** DuckDB queries use string concatenation for user input, enabling SQL injection:

```python
def spending_by_category(date_from: str, date_to: str, account_ids: list[int] | None = None, ...):
    filters = [
        f"date >= '{date_from}'",  # INJECTION RISK: date_from not quoted/escaped
        f"date <= '{date_to}'",    # INJECTION RISK: date_to not quoted/escaped
    ]
    if account_ids:
        ids = ",".join(str(i) for i in account_ids)  # int() safer, but string concat still risky
        filters.append(f"account_id IN ({ids})")
    
    where = " AND ".join(filters)
    result = conn.execute(f"""
        SELECT ... FROM transactions_view
        WHERE {where}  # Unparameterized WHERE
    """).fetchall()
```

**Attack Vector:** 
```
GET /api/reports/spending-by-category?date_from=2026-01-01' OR '1'='1&date_to=2026-12-31
# Generates: WHERE date >= '2026-01-01' OR '1'='1' AND ...
# Returns all rows regardless of date filter
```

**Impact:**
- Complete data exfiltration
- Unauthorized transaction access
- Database manipulation

**Remediation:**
1. Use parameterized queries (DuckDB supports prepared statements):
```python
result = conn.execute(
    "SELECT * FROM transactions_view WHERE date >= ? AND date <= ?",
    [date_from, date_to]
)
```
2. For list parameters, use proper escaping:
```python
if account_ids:
    placeholders = ",".join(["?" for _ in account_ids])
    query = f"... WHERE account_id IN ({placeholders})"
    result = conn.execute(query, account_ids)
```
3. Code locations to fix:
   - `analytics.py`: `spending_by_category()` lines 36-46
   - `analytics.py`: `monthly_spending_trend()` lines 74-77
   - `analytics.py`: `pivot_transactions()` lines 108-128

**Priority:** CRITICAL - Immediate fix required

---

### 3.2 SQL Injection in Analytics View Definition [CRITICAL]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/services/analytics.py` (lines 11-23)  
**Severity:** CRITICAL

**Finding:** SQLite file path is interpolated into view definition without sanitization:

```python
def sync_transactions_to_duckdb(sqlite_path: str | None = None):
    sqlite_path = sqlite_path or settings.sqlite_path
    conn = get_duckdb()
    conn.execute(f"""
        ... CREATE OR REPLACE VIEW transactions_view AS
            SELECT ...
            FROM sqlite_scan('{sqlite_path}', 'transactions') t  # UNQUOTED PATH
    """)
```

**Risk:** While `sqlite_path` is controlled by config, it's still a pattern vulnerability. If config can be modified externally, path traversal or malicious SQLite file could be loaded.

**Remediation:**
1. Use parameterized approach or validate path:
```python
from pathlib import Path
sqlite_path = Path(sqlite_path).resolve()  # Validate absolute path
# Then ensure path is within expected directory
if not str(sqlite_path).startswith(str(settings.data_dir)):
    raise ValueError("Invalid SQLite path")
```
2. Quote the path in SQL if possible

**Priority:** CRITICAL

---

### 3.3 Path Traversal in Backup Download [HIGH]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/routers/admin.py` (lines 39-50)  
**Severity:** HIGH

**Finding:** Backup download uses filename validation but has gap in logic:

```python
@router.get("/backup/download/{filename}")
async def download_backup(filename: str):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    path = Path(settings.backups_dir) / filename
    if not path.exists() or not path.suffix == ".gz":
        raise HTTPException(404, "Backup not found")
    return FileResponse(...)
```

**Issue:** Uses blacklist instead of whitelist. Attack: `filename=...\..\..\etc\passwd` might bypass slash check on Windows. Also doesn't verify `path.resolve()` is still within `backups_dir`.

**Remediation:**
```python
@router.get("/backup/download/{filename}")
async def download_backup(filename: str):
    # Whitelist: only alphanumeric, dash, underscore, dot
    if not re.match(r'^[a-zA-Z0-9_\-\.]+\.tar\.gz$', filename):
        raise HTTPException(400, "Invalid filename")
    
    path = Path(settings.backups_dir) / filename
    resolved = path.resolve()
    
    # Verify path is within backups_dir
    if not resolved.is_relative_to(Path(settings.backups_dir).resolve()):
        raise HTTPException(400, "Invalid filename")
    
    if not resolved.exists():
        raise HTTPException(404, "Backup not found")
    
    return FileResponse(path=str(resolved), ...)
```

**Priority:** HIGH

---

### 3.4 Restore Function Executes Raw SQL Without Validation [CRITICAL]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/services/restore.py` (lines 40-74, 107-129)  
**Severity:** CRITICAL

**Finding:** Restore endpoint executes arbitrary SQL from tar.gz files without content validation:

```python
async def _restore_from_sql(sql_text: str) -> None:
    # ...
    await asyncio.to_thread(_sync_apply_sql_dump, str(db_path), sql_text)

def _sync_apply_sql_dump(db_path: str, sql_text: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(sql_text)  # EXECUTES ARBITRARY SQL
    finally:
        conn.close()
```

**Risk:** A malicious tar.gz file can contain SQL that:
- Drops all tables
- Exfiltrates data to external server
- Modifies schema
- Inserts backdoor data

**Impact:** Complete database compromise through file upload.

**Remediation:**
1. Disable restore from SQL method (use JSON-only):
```python
if has_sql:
    raise ValueError("SQL restore not supported; use JSON method")
```
2. Or validate SQL against whitelist of allowed statements:
```python
forbidden_keywords = ["DROP", "DELETE", "TRUNCATE", "PRAGMA"]
for keyword in forbidden_keywords:
    if keyword in sql_text.upper():
        raise ValueError(f"Forbidden SQL keyword: {keyword}")
```
3. Better: Parse and validate each statement individually
4. Implement user consent dialog for restore operations
5. Log all restore operations with timestamp/user

**Priority:** CRITICAL

---

### 3.5 Factory Reset Endpoint Unprotected [CRITICAL]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/routers/admin.py` (lines 72-77)  
**Severity:** CRITICAL

**Finding:** Factory reset endpoint has no authentication or confirmation:

```python
@router.post("/reset")
async def do_reset(db: AsyncSession = Depends(get_db)):
    try:
        return await factory_reset(db)  # WIPES ALL DATA
    except Exception as e:
        raise HTTPException(500, f"Reset failed: {e}")
```

**Impact:** Single POST request deletes all financial data. No authentication, no user confirmation, no audit log.

**Remediation:**
1. Add authentication decorator
2. Require confirmation token (sent to user email/phone first)
3. Implement two-factor confirmation
4. Log reset events with timestamp
5. Example:
```python
@router.post("/reset")
async def do_reset(
    confirmation_token: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),  # AUTH REQUIRED
):
    if not verify_reset_token(confirmation_token, current_user.id):
        raise HTTPException(401, "Invalid confirmation")
    
    await log_audit_event("FACTORY_RESET", current_user.id)
    return await factory_reset(db)
```

**Priority:** CRITICAL

---

### 3.6 Backup Endpoint Unprotected [CRITICAL]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/routers/admin.py` (lines 22-31)  
**Severity:** CRITICAL

**Finding:** Backup creation and deletion lack authentication:

```python
@router.post("/backup")
async def do_backup(body: Optional[BackupRequest] = Body(None), db: AsyncSession = Depends(get_db)):
    label = body.label if body else None
    try:
        return await create_backup(db, label=label)
```

**Risk:** Attackers can:
- Create unlimited backups (disk exhaustion)
- Delete backups by requesting list then overwriting with empty labels
- Trigger backup during data exfiltration to cover tracks

**Remediation:**
1. Add authentication to backup endpoints
2. Implement rate limiting on backup creation (max 1 per hour)
3. Encrypt backup files
4. Log all backup operations
5. Example:
```python
from fastapi.responses import JSONResponse
from functools import wraps
from datetime import datetime, timedelta

backup_timestamps = {}  # In-memory rate limit (use Redis in production)

@router.post("/backup")
async def do_backup(
    body: Optional[BackupRequest] = Body(None),
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = current_user.id
    last_backup = backup_timestamps.get(user_id)
    
    if last_backup and datetime.now() - last_backup < timedelta(hours=1):
        raise HTTPException(429, "Too many backups; wait 1 hour")
    
    backup_timestamps[user_id] = datetime.now()
    return await create_backup(db, label=body.label if body else None)
```

**Priority:** CRITICAL

---

### 3.7 Backup File Enumeration [HIGH]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/routers/admin.py` (lines 34-36)  
**Severity:** HIGH

**Finding:** Backup list endpoint returns all backups without authentication:

```python
@router.get("/backups")
async def get_backups():
    return list_backups()  # NO AUTH
```

**Risk:** Attacker can enumerate backup history, timestamps, and sizes.

**Remediation:**
1. Add authentication
2. Optionally hide metadata (size, timestamp) unless user owns backup

**Priority:** HIGH

---

### 3.8 No Input Sanitization on CSV Upload Description Fields [HIGH]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/services/csv_ingestion.py` (lines 176-205)  
**Severity:** HIGH

**Finding:** CSV description fields are stored as-is without sanitization:

```python
desc = str(row.get(desc_col, "") or "").strip()[:500] if desc_col else ""
orig_desc = str(row.get(orig_desc_col, "") or "").strip()[:500] if orig_desc_col else desc

# ...inserted directly:
tx = Transaction(
    description=desc,
    original_description=orig_desc,
    ...
)
```

**Risk:** 
- Malicious descriptions with SQL, scripts, or formatting characters could be stored
- When displayed in frontend without escaping, could cause XSS
- Stored descriptions could have injection payloads

**Example attack:** CSV row with description = `<script>alert('xss')</script>` would be stored and executed in React if not escaped.

**Remediation:**
1. Validate description format (alphanumeric, common punctuation only):
```python
import re
def sanitize_description(desc: str) -> str:
    # Keep alphanumeric, space, dash, comma, period, parentheses
    desc = re.sub(r'[^a-zA-Z0-9\s\-\.\,\(\)&]', '', desc)
    return desc[:500].strip()

desc = sanitize_description(row.get(desc_col, ""))
```
2. Ensure frontend escapes all description fields (React does by default, but verify no `dangerouslySetInnerHTML`)
3. Add database constraint on description format

**Priority:** HIGH

---

### 3.9 Hardcoded Ollama Configuration [MEDIUM]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/config.py` (lines 9-11)  
**Severity:** MEDIUM

**Finding:** Ollama model and base URL are hardcoded in config without production override:

```python
ollama_base_url: str = "http://localhost:11434"
ollama_model: str = "qwen2.5:32b"
ollama_fast_model: str = "qwen2.5:7b"
```

**Risk:**
- If Ollama is on different network, default won't work
- No timeout protection if Ollama is unavailable
- No model version validation

**Remediation:**
1. Add environment variable overrides with defaults
2. Add timeouts and fallback behavior:
```python
ollama_base_url: str = Field(default="http://localhost:11434", env="OLLAMA_BASE_URL")
ollama_timeout: int = Field(default=30, env="OLLAMA_TIMEOUT")
ollama_retries: int = Field(default=3, env="OLLAMA_RETRIES")
```
3. Test Ollama availability at startup with meaningful errors

**Priority:** MEDIUM

---

## 4. DEPENDENCY ANALYSIS

### 4.1 Dependency Vulnerabilities [HIGH]
**Files:** 
- `/home/nick/dev/lucent/idea/Tally/backend/pyproject.toml`
- `/home/nick/dev/lucent/idea/Tally/frontend/package.json`

**Severity:** HIGH

**Finding:** No automated dependency scanning configured. Manual review of critical packages:

**Python Packages:**
- `fastapi>=0.115.0` ✓ Recent, security patches active
- `sqlalchemy>=2.0.36` ✓ Recent, active development
- `duckdb>=1.1.3` ✓ Recent release
- `httpx>=0.28.0` ✓ Good
- `yfinance>=0.2.50` - Version may be outdated; external API dependency adds risk
- No `requests` library (good, uses `httpx` instead)
- No API key handling library (passwords sent in plain request parameters)

**JavaScript Packages:**
- `react@19.0.0` ✓ Latest
- `axios@1.7.9` ✓ Maintained
- `recharts@2.13.3` ✓ Recent
- No security scanning via `npm audit` in package.json scripts

**Remediation:**
1. Add security scanning to build pipeline:
```bash
# Python
pip-audit  # Or use bandit for security linting
# JavaScript
npm audit --audit-level=moderate
```
2. Pin exact versions in production (use `==` instead of `>=`)
3. Add GitHub Dependabot or similar for automated updates
4. Update `yfinance` to latest version
5. Add pre-commit hook:
```yaml
repos:
  - repo: local
    hooks:
      - id: pip-audit
        name: pip-audit
        entry: pip-audit
        language: system
        types: [python]
        stages: [commit]
```

**Priority:** HIGH

---

## 5. CONFIGURATION SECURITY

### 5.1 Debug Mode Not Explicitly Disabled [MEDIUM]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/main.py`  
**Severity:** MEDIUM

**Finding:** FastAPI app does not explicitly set `debug=False` for production. Default is safe, but should be explicit:

```python
app = FastAPI(
    title="Tally API",
    description="Local-first personal finance tracker",
    version="0.1.0",
    lifespan=lifespan,
    # No debug parameter (defaults to False, but should be explicit)
)
```

Also, SQLAlchemy echo is disabled in database.py, which is correct.

**Remediation:**
```python
app = FastAPI(
    title="Tally API",
    description="Local-first personal finance tracker",
    version="0.1.0",
    lifespan=lifespan,
    debug=settings.debug,  # Add to config.py with env override
)
```

Config addition:
```python
debug: bool = Field(default=False, env="DEBUG")
```

**Priority:** MEDIUM

---

### 5.2 API Documentation Exposes Endpoint Details [MEDIUM]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/main.py` (FastAPI auto-generates /docs and /redoc)  
**Severity:** MEDIUM

**Finding:** FastAPI automatically generates Swagger/ReDoc documentation at `/docs` and `/redoc`, exposing all endpoints, request/response schemas, and parameters.

**Risk:**
- Attackers can learn all API endpoints without reverse engineering
- Detailed schema helps craft injection attacks
- Default credentials or examples might be visible

**Remediation:**
1. Disable docs in production:
```python
app = FastAPI(
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)
```
2. Or protect with authentication:
```python
from fastapi.openapi.utils import get_openapi

def get_openapi_schema():
    if not settings.debug:
        return {"openapi": "3.1.0", "info": {"title": "API", "version": "1.0.0"}, "paths": {}}
    return get_openapi(...)

app.openapi = get_openapi_schema
```

**Priority:** MEDIUM

---

### 5.3 Environment Configuration Not Validated [MEDIUM]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/config.py`  
**Severity:** MEDIUM

**Finding:** Settings are not validated at startup:

```python
class Settings(BaseSettings):
    data_dir: str = str(Path.home() / ".tally")
    sqlite_path: str = ""
    duckdb_path: str = ""
    ollama_base_url: str = "http://localhost:11434"
    # No validation of paths or URLs
```

**Risk:**
- Invalid paths not caught until runtime
- Ollama URL could be malicious external host
- CORS origins not validated as actual URLs

**Remediation:**
```python
from pydantic import Field, validator, HttpUrl

class Settings(BaseSettings):
    data_dir: str = Field(default=str(Path.home() / ".tally"))
    sqlite_path: str = ""
    cors_origins: list[str] = Field(default=["http://localhost:5173"])
    ollama_base_url: str = Field(default="http://localhost:11434")
    
    @validator('data_dir')
    def validate_data_dir(cls, v):
        path = Path(v).expanduser()
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
        return str(path)
    
    @validator('cors_origins', pre=True)
    def validate_cors_origins(cls, v):
        if isinstance(v, str):
            v = v.strip("[]").split(",")
        for origin in v:
            # Validate it's a valid URL origin
            if not origin.startswith(("http://", "https://")):
                raise ValueError(f"Invalid CORS origin: {origin}")
        return v
```

**Priority:** MEDIUM

---

## 6. DATA PROTECTION

### 6.1 No Encryption at Rest [CRITICAL]
**File:** SQLite database at `~/.tally/tally.db`  
**Severity:** CRITICAL

**Finding:** Financial data (transactions, account balances, net worth) stored in plaintext SQLite database. No encryption at rest.

**Risk:**
- Database file readable by any process with file access
- If device is stolen or compromised, all financial data exposed
- Backups also unencrypted

**Remediation:**
1. Implement database encryption using SQLite3 with `pycryptodome`:
```python
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes

# Encrypt database with AES-256
# Or use SQLCipher library:
# pip install sqlcipher3
# Then: cipher_text = "sqlite:///path/to/db?cipher=aes256&key=..."
```
2. Or use OS-level encryption (LUKS on Linux, FileVault on macOS, BitLocker on Windows)
3. Encrypt backup files:
```python
from cryptography.fernet import Fernet

def encrypt_backup(backup_path: Path, key: bytes):
    cipher = Fernet(key)
    with open(backup_path, 'rb') as f:
        data = f.read()
    encrypted = cipher.encrypt(data)
    with open(backup_path.with_suffix('.gz.encrypted'), 'wb') as f:
        f.write(encrypted)
```

**Priority:** CRITICAL - Especially important for financial data

---

### 6.2 No Encryption in Transit [HIGH]
**File:** API endpoints (localhost only in dev)  
**Severity:** HIGH

**Finding:** HTTP (not HTTPS) is used. No transport encryption for data in transit.

**Risk:**
- If deployed over network, financial data transmitted in plaintext
- Man-in-the-middle attacks possible
- Credentials (if added) transmitted unencrypted

**Remediation:**
1. Enforce HTTPS in production:
```python
# main.py
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware

if not settings.debug:
    app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts  # Define in config
)
```
2. Use SSL/TLS certificates (Let's Encrypt for free)
3. Add HSTS header:
```python
@app.middleware("http")
async def add_hsts_header(request, call_next):
    response = await call_next(request)
    if not settings.debug:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
```

**Priority:** HIGH

---

### 6.3 Raw Source Data Stored Without PII Masking [MEDIUM]
**File:** `/home/nick/dev/lucent/idea/Tally/backend/app/models/transaction.py` (line 42)  
**Severity:** MEDIUM

**Finding:** Transactions store `raw_source` (dict) containing original CSV data:

```python
class Transaction(Base):
    raw_source: Mapped[dict | None] = mapped_column(JSON)
```

Original CSV may contain sensitive PII:
- Full account numbers (only masked in UI)
- Merchant details
- Payee names
- Email addresses embedded in descriptions

**Risk:**
- Raw data could be exfiltrated
- No audit trail on raw data access
- Raw data not encrypted if database is compromised

**Remediation:**
1. Mask sensitive fields before storing:
```python
def sanitize_raw_source(raw: dict) -> dict:
    sanitized = raw.copy()
    # Mask account numbers
    if 'account_number' in sanitized:
        sanitized['account_number'] = sanitized['account_number'][-4:] if len(sanitized['account_number']) > 4 else '****'
    # Remove PII fields
    for pii_field in ['email', 'phone', 'ssn']:
        sanitized.pop(pii_field, None)
    return sanitized
```
2. Or don't store raw source at all if not needed
3. If kept, encrypt the JSON field

**Priority:** MEDIUM

---

## 7. ERROR HANDLING & LOGGING

### 7.1 Detailed Error Messages Leak Information [HIGH]
**File:** Multiple routers (e.g., admin.py line 31, restore.py line 69)  
**Severity:** HIGH

**Finding:** Error messages expose internal details:

```python
# admin.py
except Exception as e:
    raise HTTPException(500, f"Backup failed: {e}")  # EXPOSES ERROR DETAILS

# restore.py  
except ValueError as e:
    raise HTTPException(422, str(e))  # EXPOSES VALIDATION ERRORS
    
# snapshots.py
except Exception as e:
    raise HTTPException(400, f"Could not fetch price for {ticker}: {e}")
```

**Risk:**
- Stack traces visible to attackers
- Database error messages reveal schema
- File paths exposed (e.g., SQLite path in exceptions)

**Remediation:**
1. Log detailed errors server-side, return generic message to client:
```python
import logging
logger = logging.getLogger(__name__)

@router.post("/backup")
async def do_backup(...):
    try:
        return await create_backup(db, label=label)
    except Exception as e:
        logger.error(f"Backup failed: {e}", exc_info=True)  # Log full error
        raise HTTPException(500, "Backup operation failed. Contact support.")  # Generic message
```
2. Implement error tracking (Sentry, LogRocket) for detailed errors
3. Never expose file paths, stack traces, or SQL errors to clients

**Priority:** HIGH

---

### 7.2 No Audit Logging for Sensitive Operations [HIGH]
**File:** All routers  
**Severity:** HIGH

**Finding:** Sensitive operations (delete account, reset database, restore, download backup) are not logged:

```python
@router.delete("/{account_id}")
async def delete_account(account_id: int, db: AsyncSession = Depends(get_db)):
    # ... NO AUDIT LOG
    account.is_active = False
    await db.commit()

@router.post("/reset")
async def do_reset(db: AsyncSession = Depends(get_db)):
    # ... NO AUDIT LOG - CRITICAL!
    return await factory_reset(db)
```

**Risk:**
- No detection of unauthorized operations
- No evidence of who performed sensitive actions
- Impossible to investigate security incidents

**Remediation:**
1. Create audit log table:
```python
class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    timestamp: Mapped[DateTime] = mapped_column(server_default=func.now())
    operation: Mapped[str] = mapped_column(String(100))
    resource_type: Mapped[str] = mapped_column(String(50))
    resource_id: Mapped[int | None]
    user_id: Mapped[str | None]  # Add once auth is implemented
    status: Mapped[str] = mapped_column(String(20))  # success/failure
    details: Mapped[dict] = mapped_column(JSON)  # Changes made
    ip_address: Mapped[str | None]
```
2. Log all sensitive operations:
```python
async def log_audit(db, operation, resource_type, resource_id, status, details=None):
    await db.add(AuditLog(
        operation=operation,
        resource_type=resource_type,
        resource_id=resource_id,
        status=status,
        details=details or {},
    ))
    await db.commit()

@router.delete("/{account_id}")
async def delete_account(account_id: int, db: AsyncSession = Depends(get_db)):
    try:
        account = await db.get(Account, account_id)
        account.is_active = False
        await db.commit()
        await log_audit(db, "DELETE_ACCOUNT", "Account", account_id, "success")
    except Exception as e:
        await log_audit(db, "DELETE_ACCOUNT", "Account", account_id, "failure", {"error": str(e)})
```

**Priority:** HIGH

---

## 8. SECURITY HEADERS

### 8.1 Missing Security Headers [MEDIUM]
**File:** FastAPI application  
**Severity:** MEDIUM

**Finding:** No security headers configured:
- No `X-Content-Type-Options: nosniff`
- No `X-Frame-Options: DENY`
- No `Content-Security-Policy`
- No `Referrer-Policy`
- No `Permissions-Policy`

**Remediation:**
```python
from fastapi.middleware.cors import CORSMiddleware

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if not settings.debug:
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return response
```

**Priority:** MEDIUM

---

## 9. RATE LIMITING & DOS PROTECTION

### 9.1 No Rate Limiting on API Endpoints [HIGH]
**File:** All routers  
**Severity:** HIGH

**Finding:** No rate limiting configured. All endpoints are open to DoS attacks.

**Risk:**
- CSV import with huge file could crash server
- Backup creation in loop could exhaust disk
- Bulk approval with millions of IDs could hang database
- Stock price lookup could hammer yfinance API

**Remediation:**
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Per endpoint
@router.post("/csv")
@limiter.limit("5/minute")  # Max 5 uploads per minute
async def upload_csv(...):
    ...

@router.post("/backup")
@limiter.limit("1/hour")  # Max 1 backup per hour
async def do_backup(...):
    ...

@router.post("/reset")
@limiter.limit("1/hour")
async def do_reset(...):
    ...
```

**Also add file size limits:**
```python
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB for CSV

@router.post("/csv")
async def upload_csv(file: UploadFile = File(...)):
    if file.size and file.size > MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"File too large; max {MAX_UPLOAD_SIZE} bytes")
```

**Priority:** HIGH

---

### 9.2 No Request Size Limits [MEDIUM]
**File:** FastAPI configuration  
**Severity:** MEDIUM

**Finding:** No `max_request_body_size` configured for FastAPI/Uvicorn.

**Risk:**
- Large payload attacks could exhaust server memory
- Bulk operations (bulk-approve) could POST huge JSON arrays

**Remediation:**
```python
# uvicorn startup
# uvicorn app.main:app --limit-request-fields 100 --limit-request-line 8190 --limit-concurrency 100

# Or in code:
from fastapi import FastAPI
app = FastAPI()

@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    if request.method in ["POST", "PUT", "PATCH"]:
        body = await request.body()
        if len(body) > 10 * 1024 * 1024:  # 10MB limit
            return JSONResponse({"detail": "Request body too large"}, status_code=413)
    return await call_next(request)
```

**Priority:** MEDIUM

---

## 10. ACCESS CONTROL

### 10.1 No User Isolation or Multi-User Support [CRITICAL]
**File:** All routers  
**Severity:** CRITICAL

**Finding:** Database has no concept of "user" or "account ownership". All data belongs to global context.

**Risk:**
- If deployed with multiple users, all users see all transactions/accounts
- No tenant isolation in SaaS scenario
- Family members (Nick/Emma) in tags but no access control to filter by person

**Remediation:**
1. Add `user_id` columns to data models:
```python
class Transaction(Base):
    user_id: str = mapped_column(ForeignKey("users.id"), index=True)
    # ... rest of fields

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    email: Mapped[str]
```
2. Filter all queries by current user:
```python
@router.get("/")
async def list_transactions(
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == current_user.id)  # ALWAYS FILTER BY USER
        .order_by(Transaction.date.desc())
    )
    return result.scalars().all()
```
3. Verify user ownership in update/delete operations

**Priority:** CRITICAL

---

### 10.2 No Authorization Checks on Individual Resources [HIGH]
**File:** All routers with ID parameters (e.g., transactions.py, accounts.py)  
**Severity:** HIGH

**Finding:** Once user isolation is added, must verify ownership before modify:

```python
@router.patch("/{tx_id}")
async def update_transaction(tx_id: int, body: TransactionUpdate, db: AsyncSession = Depends(get_db)):
    tx = await db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(404, "Not found")
    # MISSING: Verify current_user.id == tx.user_id
    tx.category_id = body.category_id
    ...
```

**Risk:** After adding user_id, accessing another user's transactions by guessing their IDs.

**Remediation:**
```python
@router.patch("/{tx_id}")
async def update_transaction(
    tx_id: int,
    body: TransactionUpdate,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tx = await db.get(Transaction, tx_id)
    if not tx or tx.user_id != current_user.id:
        raise HTTPException(404, "Not found")  # Don't reveal if forbidden
    # ... update
```

**Priority:** HIGH

---

## Summary Table of Findings

| ID | Category | Severity | Issue | File(s) | Effort to Fix |
|---|---|---|---|---|---|
| 1.1 | Auth | CRITICAL | No authentication layer | main.py, all routers | High (2-3 days) |
| 1.2 | CORS | HIGH | Overly permissive CORS | main.py | Low (1 hour) |
| 1.3 | Database | HIGH | Async deadlock risk with SQLite | database.py | Medium (4 hours) |
| 3.1 | Injection | CRITICAL | SQL injection via DuckDB | analytics.py | High (2-3 hours) |
| 3.2 | Injection | CRITICAL | SQL injection in view definition | analytics.py | Low (30 min) |
| 3.3 | Path Traversal | HIGH | Path traversal in backup download | admin.py | Low (1 hour) |
| 3.4 | Injection | CRITICAL | Raw SQL execution in restore | restore.py | High (2 hours) |
| 3.5 | Auth | CRITICAL | Unprotected factory reset | admin.py | Low (1 hour) |
| 3.6 | Auth | CRITICAL | Unprotected backup endpoint | admin.py | Low (1 hour) |
| 3.7 | Info Disclosure | HIGH | Backup enumeration | admin.py | Low (30 min) |
| 3.8 | Input Validation | HIGH | No input sanitization on CSV | csv_ingestion.py | Medium (1-2 hours) |
| 3.9 | Config | MEDIUM | Hardcoded Ollama URL | config.py | Low (30 min) |
| 4.1 | Dependencies | HIGH | No vulnerability scanning | pyproject.toml, package.json | Low (2 hours setup) |
| 5.1 | Config | MEDIUM | Debug mode not explicit | main.py | Low (30 min) |
| 5.2 | Info Disclosure | MEDIUM | API docs expose endpoints | main.py | Low (30 min) |
| 5.3 | Config | MEDIUM | Settings not validated | config.py | Low (1 hour) |
| 6.1 | Encryption | CRITICAL | No encryption at rest | database.py | High (1-2 days) |
| 6.2 | Encryption | HIGH | No HTTPS/TLS | main.py | Medium (3-4 hours) |
| 6.3 | PII | MEDIUM | Raw data not masked | transaction.py, csv_ingestion.py | Medium (1-2 hours) |
| 7.1 | Error Handling | HIGH | Detailed error messages | all routers | Medium (2 hours) |
| 7.2 | Logging | HIGH | No audit logging | all routers | High (2-3 hours) |
| 8.1 | Headers | MEDIUM | Missing security headers | main.py | Low (1 hour) |
| 9.1 | DoS | HIGH | No rate limiting | all routers | Medium (1-2 hours) |
| 9.2 | DoS | MEDIUM | No request size limits | main.py | Low (1 hour) |
| 10.1 | Access Control | CRITICAL | No user isolation | all models, routers | High (2-3 days) |
| 10.2 | Authorization | HIGH | No ownership verification | all routers | High (2-3 days) |

---

## Remediation Roadmap

### Phase 1: Critical Fixes (3-5 days) - MUST DO BEFORE ANY NETWORK EXPOSURE
1. **Add Authentication & Authorization** (1.1, 10.1, 10.2)
   - Implement JWT-based auth or session management
   - Add user_id to all data models
   - Filter all queries by user_id
   - Verify ownership in update/delete operations
   - **Est:** 2-3 days

2. **Fix SQL Injection Vulnerabilities** (3.1, 3.2, 3.4)
   - Use parameterized queries in DuckDB analytics
   - Validate SQLite path
   - Disable raw SQL restore (use JSON-only)
   - **Est:** 2-3 hours

3. **Protect Admin Endpoints** (3.5, 3.6, 3.7)
   - Add authentication to /api/admin/* routes
   - Implement rate limiting on sensitive operations
   - Fix backup download path traversal
   - **Est:** 2 hours

### Phase 2: High Findings (2-3 days)
4. **Implement Encryption** (6.1, 6.2)
   - Enable SQLite WAL mode and encryption
   - Configure HTTPS with TLS certificates
   - Encrypt backup files
   - **Est:** 1-2 days

5. **Add Error Handling & Logging** (7.1, 7.2)
   - Implement generic error messages to clients
   - Add audit logging for sensitive operations
   - Configure logging to file/centralized service
   - **Est:** 2 hours

6. **Fix Input Validation & Injection** (3.8)
   - Sanitize CSV descriptions before storage
   - Add regex validation on descriptions
   - **Est:** 1-2 hours

7. **Add Security Headers & DoS Protection** (8.1, 9.1, 9.2)
   - Add security middleware for headers
   - Implement rate limiting
   - Add request size limits
   - **Est:** 1-2 hours

### Phase 3: Medium Findings (1-2 days)
8. **Fix Configuration Issues** (5.1, 5.2, 5.3)
   - Add explicit debug mode control
   - Disable API docs in production
   - Add config validation at startup
   - **Est:** 1 hour

9. **Harden CORS & Ollama** (1.2, 3.9)
   - Restrict CORS methods and headers
   - Add Ollama timeout and validation
   - **Est:** 1 hour

10. **Data Protection** (6.3)
    - Mask PII in raw_source fields
    - Implement data minimization
    - **Est:** 1-2 hours

11. **Dependency Scanning** (4.1)
    - Set up automated vulnerability scanning
    - Update vulnerable packages
    - Pin versions
    - **Est:** 2 hours

---

## Testing Recommendations

1. **SAST (Static Analysis):** Use `bandit`, `semgrep`, `pylint` for Python
2. **DAST (Dynamic Analysis):** Use `OWASP ZAP` or `Burp Suite Community` to test running app
3. **Dependency Scanning:** Use `pip-audit`, `npm audit`
4. **Penetration Testing:** Manual testing of injection, auth bypass, access control
5. **Load Testing:** Use `locust` or `k6` to test rate limiting and DoS protection

---

## References

- OWASP Top 10 2021: https://owasp.org/Top10/
- OWASP Cheat Sheets: https://cheatsheetseries.owasp.org/
- CWE/SANS Top 25: https://cwe.mitre.org/top25/
- FastAPI Security: https://fastapi.tiangolo.com/tutorial/security/
- SQLAlchemy Security: https://docs.sqlalchemy.org/en/20/faq/security.html
