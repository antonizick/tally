# Tally Production Installation Guide

This guide covers installing Tally on Ubuntu 22.04 LTS, 24.04 LTS, or Debian 11/12 for production use.

## Overview

Tally is a privacy-first personal finance tracker that runs entirely on your machine. This installer:
- Sets up a Python/FastAPI backend on port 8000 (internal only)
- Builds and serves a React frontend via nginx on port 80
- Seeds sample data (categories, accounts, sample transactions)
- Configures systemd service for automatic startup and restart
- Optionally installs Ollama for AI-powered transaction categorization

**No cloud connection, no external APIs (except stock prices), no database server required.**

---

## System Requirements

### Hardware
- **CPU:** 2+ cores (modern Intel/AMD)
- **RAM:** 2 GB minimum (4 GB recommended)
- **Disk:** 10 GB available space (25+ GB if using Ollama)
- **Network:** Internet connection for installation; local network access for web UI

### Operating System
- Ubuntu 22.04 LTS, 24.04 LTS
- Debian 11, 12
- Must have `sudo` access (or run as root)

---

## One-Command Installation

The fastest way to install Tally:

```bash
curl -fsSL https://raw.githubusercontent.com/antonizick/tally/main/install.sh | sudo bash
```

This will:
1. ✓ Update system and install all dependencies
2. ✓ Clone Tally from GitHub to `/opt/tally`
3. ✓ Build Python backend with all dependencies
4. ✓ Build React frontend 
5. ✓ Configure nginx as reverse proxy
6. ✓ Set up systemd service
7. ✓ Seed database with sample data
8. ✓ Start all services
9. ✓ Prompt to optionally install Ollama

The installation takes 5-10 minutes (longer if pulling Ollama models).

### Installation Prompts

During installation, you'll be asked:

**Ollama Installation:**
```
ℹ Ollama (optional AI categorization)
? Install Ollama? [y/N]:
```

- **Yes** → Install Ollama and optionally pull a model
  - Model options: `qwen2.5:7b` (8 GB, ~5 min) or `qwen2.5:32b` (20 GB, ~20 min)
- **No** → Tally works fine without it; transactions default to "Uncategorized"

---

## Accessing Tally

Once installation completes, you'll see:

```
✓ Tally installation complete!

Access your Tally instance at:
  http://<your-server-ip>
  (or http://localhost if installing on this machine)

API documentation: http://<your-server-ip>/docs
```

Open that URL in your browser. You'll see the Tally dashboard with sample data already loaded:
- **Dashboard** — Net worth trends, spending breakdown
- **Transactions** — Sample transactions from "Chase Checking" account
- **Settings** — Backup/restore, administration, manage accounts
- **Reports** — Pivot tables, category analysis

### First Steps

1. **Explore the sample data** (pre-loaded by the installer)
   - Dashboard shows net worth, assets, liabilities
   - Transactions tab has ~6 sample transactions
   - Net Worth section shows 7 pre-configured views

2. **Add your accounts** (Settings → Accounts)
   - Create one account per bank/card
   - Choose account type: checking, savings, credit card, brokerage, retirement, etc.

3. **Import your bank statements** (Settings → Accounts → Import CSV)
   - Click the account dropdown, select CSV file
   - Tally auto-detects CSV format (95%+ accuracy)
   - Transactions are categorized automatically (if Ollama is running)

4. **Take a snapshot** (Settings → Net Worth → Create Snapshot)
   - Record your assets/liabilities at a point in time
   - Dashboard automatically calculates net worth trend

---

## Service Management

All commands should be run with `sudo`.

### Start/Stop/Restart

```bash
# Start the backend service
sudo systemctl start tally-backend

# Stop the backend service
sudo systemctl stop tally-backend

# Restart (useful after configuration changes)
sudo systemctl restart tally-backend

# Check current status
sudo systemctl status tally-backend
```

### View Logs

```bash
# Last 20 lines of backend log
sudo tail -f /var/log/tally/backend.log

# Or use systemd journal (live, colored)
sudo journalctl -u tally-backend -f

# Yesterday's logs
sudo journalctl -u tally-backend --since=yesterday
```

### Auto-Start on Boot

The installer automatically enables the service:

```bash
# Verify (should show "enabled")
sudo systemctl is-enabled tally-backend
```

---

## Configuration

### Environment Variables

The installer creates `/opt/tally/backend/.env` with production defaults:

```env
DATA_DIR=/var/lib/tally
SQLITE_PATH=/var/lib/tally/tally.db
DUCKDB_PATH=/var/lib/tally/tally.duckdb
BACKUPS_DIR=/var/lib/tally/backups

CORS_ORIGINS=["http://localhost","http://127.0.0.1"]

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_FAST_MODEL=qwen2.5:7b
```

To modify:
```bash
sudo nano /opt/tally/backend/.env
sudo systemctl restart tally-backend
```

### Changing the Port

By default, Tally listens on port 80. To use a different port (e.g., 8080):

```bash
# Edit nginx config
sudo nano /etc/nginx/sites-available/tally

# Change: listen 80;
# To:     listen 8080;

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### Network Access

By default, nginx listens on all network interfaces. To restrict to localhost:

```bash
sudo nano /etc/nginx/sites-available/tally
# Change: listen 80;
# To:     listen 127.0.0.1:80;

sudo systemctl reload nginx
```

To enable HTTPS (recommended for remote access):
1. Install Certbot: `sudo apt-get install certbot python3-certbot-nginx`
2. Generate certificate: `sudo certbot --nginx -d your-domain.com`
3. Restart nginx: `sudo systemctl reload nginx`

---

## Ollama & AI Categorization

### Installing Ollama After Initial Setup

If you skipped Ollama during installation:

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model (choose one)
ollama pull qwen2.5:7b          # Fast (8GB)
ollama pull qwen2.5:32b         # Accurate (20GB)

# Restart Tally to use the model
sudo systemctl restart tally-backend
```

### Model Selection

| Model | VRAM | Speed | Accuracy | Recommendation |
|-------|------|-------|----------|---|
| `qwen2.5:7b` | 8 GB | Fast | Good | Default |
| `qwen2.5:32b` | 20 GB | Slower | Excellent | Large financial records |

### GPU Acceleration (Optional)

If your system has an NVIDIA or AMD GPU, Ollama will use it automatically for faster inference. No configuration needed.

### Disabling AI Categorization

Edit `.env`:
```env
# Just comment out or set to blank
OLLAMA_BASE_URL=
```

Then restart:
```bash
sudo systemctl restart tally-backend
```

Transactions will import with "Uncategorized" status (you can manually categorize them).

---

## Backup & Restore

Tally includes a built-in backup system accessible from the web UI (Settings → Administration).

### Manual Backup (Command Line)

```bash
curl -X POST http://localhost/api/admin/backup
# Returns: {"filename": "tally_backup_20260520_145432.tar.gz"}
```

Backups are stored in `/var/lib/tally/backups/`.

### Manual Restore

```bash
# Via curl (replace with your backup filename)
curl -X POST -F "file=@tally_backup_20260520_145432.tar.gz" http://localhost/api/admin/restore

# Or from the web UI: Settings → Administration → Restore
```

### Factory Reset

To start over with a fresh database:

```bash
curl -X POST http://localhost/api/admin/reset
```

This deletes all data and reloads the sample dataset.

---

## Updating Tally

To update to the latest version:

```bash
cd /opt/tally
sudo git pull origin main
sudo bash install.sh
```

Or, if you're familiar with the process:

```bash
# Backend
cd /opt/tally/backend
.venv/bin/pip install -e --upgrade .

# Frontend
cd /opt/tally/frontend
npm ci
npm run build

# Restart
sudo systemctl restart tally-backend
sudo systemctl reload nginx
```

---

## Troubleshooting

### "Connection refused" when accessing the web UI

1. Check if nginx is running:
   ```bash
   sudo systemctl status nginx
   ```

2. Check if backend is running:
   ```bash
   sudo systemctl status tally-backend
   sudo curl http://127.0.0.1:8000/health
   ```

3. Check nginx error logs:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

### "File not found" on page refresh

This usually means the React SPA is not being routed correctly. Verify nginx config:
```bash
sudo nginx -t
cat /etc/nginx/sites-enabled/tally | grep "try_files"
# Should show: try_files $uri $uri/ /index.html;
```

### Transactions not auto-categorizing

1. Check if Ollama is running:
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. Check backend logs for errors:
   ```bash
   sudo journalctl -u tally-backend -n 50
   ```

3. If Ollama isn't responding, fall back to manual categorization (still fully functional)

### Out of disk space

Check data directory:
```bash
du -sh /var/lib/tally
du -sh /var/lib/tally/*
```

Large backups can be deleted from Settings → Administration, or manually:
```bash
sudo rm /var/lib/tally/backups/tally_backup_*.tar.gz
```

### Performance issues

1. Check system resources:
   ```bash
   free -h
   df -h /var/lib/tally
   ```

2. Reduce Ollama model size:
   ```bash
   # Switch from 32b to 7b model in .env
   sudo nano /opt/tally/backend/.env
   # Set: OLLAMA_MODEL=qwen2.5:7b
   ```

3. Check database size:
   ```bash
   ls -lh /var/lib/tally/*.db
   # If >500MB, consider archiving old transactions
   ```

---

## Uninstallation

To remove Tally completely:

```bash
sudo bash /opt/tally/uninstall.sh
```

You'll be prompted whether to:
- Remove the installation directory (`/opt/tally`) — always removed
- Remove all data (`/var/lib/tally`) — optional

---

## Security Notes

### Local-Only by Default

- Backend listens on `127.0.0.1:8000` (internal only)
- Nginx accepts connections from all interfaces on port 80
- No authentication layer (assume local network trust)

### If Accessing Remotely

1. **Use a VPN** (safest option)
2. **Use SSH tunnel**:
   ```bash
   ssh -L 8080:localhost:80 user@your-server
   # Then access: http://localhost:8080
   ```
3. **Enable HTTPS** (see "Changing the Port" section)
4. **Firewall rules**:
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

### Data Privacy

All your financial data stays on your machine:
- ✓ No cloud sync
- ✓ No external categorization service (Ollama runs locally)
- ✓ No tracking or telemetry
- ✓ SQLite database is a single file you can back up, encrypt, or move

---

## Getting Help

- **Installation issues:** Check `/opt/tally/README.md`
- **Feature documentation:** Visit the Settings page in-app
- **Bug reports:** https://github.com/antonizick/tally/issues
- **API documentation:** http://your-server/docs

---

## Files Reference

| Path | Purpose |
|------|---------|
| `/opt/tally` | Installation directory |
| `/opt/tally/backend` | Python backend source + venv |
| `/opt/tally/frontend` | React frontend source + built dist/ |
| `/var/lib/tally` | Data directory (SQLite, DuckDB, backups) |
| `/var/log/tally` | Log files |
| `/etc/systemd/system/tally-backend.service` | systemd service unit |
| `/etc/nginx/sites-available/tally` | nginx configuration |
| `/opt/tally/backend/.env` | Environment configuration |

---

## Support & Contributing

Tally is open source and welcomes contributions. See the main README.md in the repository for development setup.
