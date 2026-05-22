# Tally — Local-First Personal Finance Tracker

A privacy-first, open-source personal & family finance dashboard. All data stays on your machine. Powered by local Ollama AI for smart categorization.

## Features

- **CSV Import** — Auto-detects bank statement formats (checking, credit card, etc.). Remembers mappings per account.
- **AI Categorization** — Ollama (Qwen) proposes categories. Low-confidence items go to review queue. Learns from corrections.
- **Net Worth Engine** — 7 named views (retirement, cash, full enchilada, etc.) driven by monthly asset/liability snapshots.
- **Stock Prices** — Live prices from yfinance for brokerage holdings.
- **Rich Dashboard** — Net worth trend, spending breakdown, top categories.
- **Pivot Reports** — Group by category/account/month, export to CSV.
- **Dark UI** — React 19 + Tailwind + Recharts.

## Production Installation

Install Tally on Ubuntu/Debian with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/antonizick/tally/main/install.sh | sudo bash
```

**What it does:**
- ✓ Installs all system dependencies (Python 3.10+, Node.js, nginx)
- ✓ Clones Tally from this repo to `/opt/tally`
- ✓ Builds the backend (Python venv) and frontend (React)
- ✓ Configures nginx as reverse proxy (port 80)
- ✓ Sets up systemd service for auto-start/restart (or creates manual startup script if systemd unavailable)
- ✓ Optionally installs Ollama for AI categorization
- ✓ Seeds the database with sample data
- ✓ Prints access URL and service management instructions

**Environments:**
- **systemd-enabled systems** (standard Ubuntu/Debian servers): Auto-starts Tally, auto-restarts on crash, managed via `systemctl`
- **Non-systemd environments** (containers, WSL, custom init systems): Installer detects this and creates a manual startup script instead. See `./start-tally.sh` or follow the printed instructions.

**After installation:** Access your Tally instance at `http://your-server-ip`

For detailed setup, troubleshooting, configuration, and management instructions, see **[INSTALL.md](INSTALL.md)**.

---

## Quick Start (Dev)

```bash
# Prerequisites: Python 3.10+, Node 18+, Ollama running
git clone ...
cd tally

# Start everything
./dev.sh
```

Open http://localhost:5173

### First-time setup (in Settings page):

1. **Seed Categories** — Creates default category hierarchy
2. **Seed Tags** — Creates Nick, Emma, Family, Work, Cat Stuff, Subscriptions tags
3. **Seed Net Worth Views** — Creates the 7 named views from the planning doc
4. **Add Accounts** — Create account records (one per bank/card)
5. **Import CSV** — Click "Import CSV" in the header, select account, drop file

## Docker Compose

```bash
cp .env.example .env
# Edit OLLAMA_BASE_URL if Ollama isn't on localhost
docker compose up
```

## Ollama Setup

Install Ollama and pull the recommended model:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:32b      # Best quality (needs ~20GB VRAM)
ollama pull qwen2.5:7b       # Faster, uses less VRAM
```

Set the model in `.env`:
```
OLLAMA_MODEL=qwen2.5:32b
```

Tally degrades gracefully if Ollama isn't running — transactions import with "Uncategorized" and you can re-categorize manually.

## CSV Format Support

Auto-detects these patterns:

| Format | Example |
|--------|---------|
| Date + Description + Debit + Credit + Balance | Credit union checking |
| Date + Description + Category + Amount | Chase/bank download |
| Post Date + Description + Category + Amount | Credit card (USAA, etc.) |

On first import of a new format, Tally detects the mapping automatically (95%+ confidence) or asks you to confirm.

## Architecture

```
/backend
  /app
    main.py             FastAPI app + CORS
    config.py           Pydantic settings
    database.py         SQLite (async) + DuckDB connections
    /models             SQLAlchemy 2.0 models
    /schemas            Pydantic v2 schemas
    /routers            FastAPI routers (accounts, transactions, snapshots, etc.)
    /services           CSV ingestion + schema mapping + analytics
    /ai                 Ollama client + categorization + RAG
/frontend
  /src
    /pages              Dashboard, Transactions, Assets, Reports, Settings
    /components         Layout, Upload modal, charts
    /lib                API client (axios) + utilities
```

**Storage:**
- SQLite (`~/.tally/tally.db`) — transactions, accounts, corrections, snapshots
- DuckDB (`~/.tally/tally.duckdb`) — analytics/pivot queries

## Net Worth Views

The 7 named views match the planning document exactly:

| View | Includes |
|------|----------|
| Retirement accounts (no house, no stocks) | 401k, IRA |
| Retirement accounts and stocks (no house) | 401k, IRA, Brokerage |
| On hand cash (no stock) (not including debt) | Checking, Savings |
| On hand (no stock) after all debt (car included) | Cash minus all liabilities |
| On hand & stock after all debt (car included) | Cash + stocks minus liabilities |
| Retirement accounts, stocks, cash (no house) | All except home |
| The whole enchilada | Everything |

## Adding a New Bank

Accounts are created in Settings. CSV formats are auto-detected per account's header fingerprint. If auto-detection confidence < 95%, you'll be shown the proposed mapping to confirm/correct before import proceeds.

## Development

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload       # API at :8000

cd frontend
npm run dev                          # UI at :5173
```

API docs: http://localhost:8000/docs

## Security

### Phase 1: SQL Injection Prevention (2026-05-22) ✅

Implemented parameterized query fixes to prevent SQL injection vulnerabilities:

- **FIX #1:** Converted analytics queries to use parameterized statements
  - `spending_by_category()` — Date filters, account/category IDs
  - `monthly_spending_trend()` — Month range, account IDs
  - `pivot_transactions()` — Date range, account/category IDs
  
- **FIX #2:** Added SQLite path validation
  - Validates path is within expected data directory
  - Prevents directory traversal attacks
  - Confirms file exists before loading

**Status:** All fixes tested and verified on running backend.

For detailed security audit and remediation roadmap, see [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

### Security Roadmap

**Phase 2 (pending):** JSON-based backup restore with input validation  
**Phase 3 (pending):** Authentication/authorization layer, encryption at rest, CORS hardening
