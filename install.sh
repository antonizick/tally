#!/bin/bash
# Tally Deployment Installer
# Installs Tally on Ubuntu/Debian Linux with full setup: backend, frontend, nginx, systemd

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/tally"
DATA_DIR="/var/lib/tally"
LOG_DIR="/var/log/tally"
TALLY_USER="tally"
GITHUB_REPO="https://github.com/antonizick/tally"

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
}

log_error() {
    echo -e "${RED}✗${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $*"
}

die() {
    log_error "$*"
    exit 1
}

confirm() {
    local prompt="$1"
    local response
    read -p "$(echo -e ${YELLOW}?) $prompt${NC} " -r response
    [[ "$response" =~ ^[Yy]$ ]]
}

# ============================================================================
# STEP 1: Preflight checks
# ============================================================================
preflight_checks() {
    log_info "Running preflight checks..."

    # Check if root
    if [[ $EUID -ne 0 ]]; then
        die "This script must be run as root (use: sudo bash install.sh)"
    fi
    log_success "Running as root"

    # Check OS
    if ! grep -q "Ubuntu\|Debian" /etc/os-release; then
        die "This script supports Ubuntu and Debian only"
    fi
    log_success "OS is Ubuntu/Debian"

    # Check internet
    if ! timeout 2 bash -c "echo > /dev/tcp/8.8.8.8/53" 2>/dev/null; then
        die "No internet connectivity detected"
    fi
    log_success "Internet connectivity confirmed"
}

# ============================================================================
# STEP 2: Install system dependencies
# ============================================================================
install_system_deps() {
    log_info "Installing system dependencies..."

    apt-get update -qq
    apt-get install -y -qq \
        git curl wget build-essential \
        python3 python3-venv python3-pip \
        nginx \
        ca-certificates apt-transport-https gnupg lsb-release

    log_success "System dependencies installed"

    # Check Python version
    log_info "Checking Python version..."
    python_version=$(python3 --version 2>&1 | awk '{print $2}' | cut -d. -f1,2)
    required_version="3.10"

    if (( $(echo "$python_version < $required_version" | bc -l) )); then
        log_warn "Python $python_version detected (3.10+ required). Installing python3.11..."
        apt-get install -y -qq python3.11 python3.11-venv python3.11-dev
        python3 --version
    fi
    log_success "Python version OK"

    # Install Node.js 20 LTS via NodeSource
    log_info "Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
    log_success "Node.js $(node --version) installed"
}

# ============================================================================
# STEP 3: Ollama setup (user prompt)
# ============================================================================
setup_ollama() {
    log_info ""
    log_warn "Ollama (optional AI categorization)"
    echo "Tally can use Ollama for smart transaction categorization."
    echo "Without it, transactions default to 'Uncategorized' (still fully functional)."
    echo ""

    if confirm "Install Ollama?"; then
        log_info "Installing Ollama..."
        curl -fsSL https://ollama.com/install.sh | sh >/dev/null 2>&1
        sleep 2
        log_success "Ollama installed"

        log_warn "Choose a model:"
        echo "  1) qwen2.5:7b   (8GB VRAM, faster, recommended)"
        echo "  2) qwen2.5:32b  (20GB VRAM, more accurate)"
        echo "  3) Skip for now"
        read -p "$(echo -e ${YELLOW}?)${NC} Enter choice [1-3]: " -r model_choice

        if [[ "$model_choice" == "1" ]]; then
            log_info "Pulling qwen2.5:7b (this takes a few minutes)..."
            ollama pull qwen2.5:7b >/dev/null 2>&1 &
            log_success "Model pull started in background"
        elif [[ "$model_choice" == "2" ]]; then
            log_warn "Pulling qwen2.5:32b (this takes 10-15 minutes and needs 20GB VRAM)..."
            ollama pull qwen2.5:32b >/dev/null 2>&1 &
            log_success "Model pull started in background"
        else
            log_info "Skipping model pull. You can pull later: ollama pull qwen2.5:7b"
        fi
    else
        log_info "Ollama skipped. Tally will still work without it."
    fi
}

# ============================================================================
# STEP 4: Clone/update repository
# ============================================================================
setup_repository() {
    log_info "Setting up Tally repository..."

    if [[ -d "$INSTALL_DIR" ]]; then
        log_warn "$INSTALL_DIR already exists"
        if confirm "Update existing installation?"; then
            cd "$INSTALL_DIR"
            git fetch origin main
            git checkout main
            git reset --hard origin/main
            log_success "Repository updated"
        else
            log_warn "Keeping existing installation"
        fi
    else
        log_info "Cloning repository from $GITHUB_REPO..."
        git clone "$GITHUB_REPO" "$INSTALL_DIR" >/dev/null 2>&1
        log_success "Repository cloned"
    fi
}

# ============================================================================
# STEP 5: Create tally system user
# ============================================================================
setup_tally_user() {
    log_info "Setting up tally system user and directories..."

    if ! id "$TALLY_USER" &>/dev/null; then
        useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$TALLY_USER"
        log_success "User '$TALLY_USER' created"
    else
        log_warn "User '$TALLY_USER' already exists"
    fi

    mkdir -p "$DATA_DIR" "$LOG_DIR"
    chown -R "$TALLY_USER:$TALLY_USER" "$DATA_DIR" "$LOG_DIR"
    chmod 750 "$DATA_DIR" "$LOG_DIR"
    log_success "Data directories created and owned by '$TALLY_USER'"
}

# ============================================================================
# STEP 6: Setup backend
# ============================================================================
setup_backend() {
    log_info "Setting up backend..."

    cd "$INSTALL_DIR/backend"

    # Create venv
    if [[ ! -d ".venv" ]]; then
        log_info "Creating Python virtual environment..."
        python3 -m venv .venv
    fi

    # Install dependencies
    log_info "Installing Python dependencies..."
    .venv/bin/pip install -q --upgrade pip setuptools wheel
    .venv/bin/pip install -q -e .
    log_success "Backend dependencies installed"

    # Create .env from template
    if [[ ! -f ".env" ]]; then
        log_info "Creating .env with production defaults..."
        cat > .env <<EOF
# Production configuration (auto-generated by install.sh)
DATA_DIR=$DATA_DIR
SQLITE_PATH=$DATA_DIR/tally.db
DUCKDB_PATH=$DATA_DIR/tally.duckdb
BACKUPS_DIR=$DATA_DIR/backups

# CORS settings
CORS_ORIGINS=["http://localhost","http://127.0.0.1"]

# Ollama (optional)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_FAST_MODEL=qwen2.5:7b
EOF
        log_success ".env created"
    else
        log_warn ".env already exists (keeping existing)"
    fi

    # Set ownership
    chown -R "$TALLY_USER:$TALLY_USER" "$INSTALL_DIR/backend"
}

# ============================================================================
# STEP 7: Setup frontend (build)
# ============================================================================
setup_frontend() {
    log_info "Setting up frontend..."

    cd "$INSTALL_DIR/frontend"

    log_info "Installing Node dependencies..."
    npm ci --production=false >/dev/null 2>&1

    log_info "Building React application (this takes ~30-60 seconds)..."
    npm run build >/dev/null 2>&1

    if [[ ! -d "dist" ]]; then
        die "Frontend build failed"
    fi

    chown -R "$TALLY_USER:$TALLY_USER" "$INSTALL_DIR/frontend/dist"
    log_success "Frontend built and ready"
}

# ============================================================================
# STEP 7.5: Check for systemd availability
# ============================================================================
check_systemd() {
    # Check if systemd is the init system (PID 1)
    if [[ -e /run/systemd/system ]] && systemctl --version >/dev/null 2>&1; then
        return 0  # systemd is available
    else
        return 1  # systemd not available
    fi
}

# ============================================================================
# STEP 8: Setup systemd service (or auto-start for non-systemd)
# ============================================================================
setup_systemd() {
    if check_systemd; then
        log_info "Setting up systemd service..."

        cp "$INSTALL_DIR/deploy/tally-backend.service" /etc/systemd/system/
        systemctl daemon-reload

        systemctl enable tally-backend >/dev/null 2>&1
        systemctl start tally-backend

        log_info "Waiting for backend to start..."
        local max_attempts=15
        local attempts=0
        while ! curl -sf http://127.0.0.1:8000/health >/dev/null 2>&1; do
            attempts=$((attempts + 1))
            if [[ $attempts -ge $max_attempts ]]; then
                log_error "Backend failed to start. Check logs: journalctl -u tally-backend -n 20"
                exit 1
            fi
            sleep 1
        done
        log_success "Backend is running"
        SYSTEMD_AVAILABLE=true
    else
        log_warn "systemd not detected in this environment"
        log_info "Starting Tally services manually..."
        SYSTEMD_AVAILABLE=false

        # Create log directory
        mkdir -p "$LOG_DIR"
        chown "$TALLY_USER:$TALLY_USER" "$LOG_DIR"

        # Start backend in background
        log_info "Starting backend..."
        nohup sudo -u "$TALLY_USER" "$INSTALL_DIR/backend/.venv/bin/uvicorn" \
            app.main:app \
            --host 0.0.0.0 \
            --port 8000 \
            >"$LOG_DIR/backend.log" 2>&1 &
        BACKEND_PID=$!
        echo $BACKEND_PID > "$LOG_DIR/backend.pid"

        # Wait for backend to be ready
        log_info "Waiting for backend to start..."
        local max_attempts=15
        local attempts=0
        while ! curl -sf http://127.0.0.1:8000/health >/dev/null 2>&1; do
            attempts=$((attempts + 1))
            if [[ $attempts -ge $max_attempts ]]; then
                log_error "Backend failed to start. Check logs: tail -f $LOG_DIR/backend.log"
                exit 1
            fi
            sleep 1
        done
        log_success "Backend started (PID: $BACKEND_PID)"

        # Start nginx in background
        log_info "Starting nginx..."
        nohup nginx -g "daemon off;" >"$LOG_DIR/nginx.log" 2>&1 &
        NGINX_PID=$!
        echo $NGINX_PID > "$LOG_DIR/nginx.pid"
        log_success "Nginx started (PID: $NGINX_PID)"

        # Create helper script for future restarts
        cat > "$INSTALL_DIR/start-tally.sh" <<'SCRIPT'
#!/bin/bash
# Manual startup script for Tally (when systemd is not available)
set -e

INSTALL_DIR="/opt/tally"
DATA_DIR="/var/lib/tally"
LOG_DIR="/var/log/tally"
TALLY_USER="tally"

mkdir -p "$LOG_DIR"
chown "$TALLY_USER:$TALLY_USER" "$LOG_DIR"

echo "Starting Tally backend..."
nohup sudo -u $TALLY_USER $INSTALL_DIR/backend/.venv/bin/uvicorn \
    app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$LOG_DIR/backend.pid"
echo "Backend PID: $BACKEND_PID"

sleep 2

echo "Starting Tally frontend (nginx)..."
nohup nginx -g "daemon off;" >"$LOG_DIR/nginx.log" 2>&1 &
NGINX_PID=$!
echo $NGINX_PID > "$LOG_DIR/nginx.pid"
echo "Nginx PID: $NGINX_PID"

echo ""
echo "Both services are now running in the background."
SCRIPT
        chmod +x "$INSTALL_DIR/start-tally.sh"
        log_info "Helper script created: $INSTALL_DIR/start-tally.sh"
    fi
}

# ============================================================================
# STEP 9: Setup nginx
# ============================================================================
setup_nginx() {
    log_info "Configuring nginx..."

    cp "$INSTALL_DIR/deploy/tally.conf" /etc/nginx/sites-available/tally

    # Remove default site if present
    rm -f /etc/nginx/sites-enabled/default

    # Enable tally site
    ln -sf /etc/nginx/sites-available/tally /etc/nginx/sites-enabled/tally

    # Test nginx config
    if ! nginx -t >/dev/null 2>&1; then
        die "Nginx configuration is invalid. Check: nginx -t"
    fi

    if check_systemd; then
        systemctl reload nginx
    else
        # In non-systemd environments, nginx must be running manually or stopped
        log_warn "Nginx configured, but systemctl not available. Nginx will be started manually."
    fi
    log_success "Nginx configured"
}

# ============================================================================
# STEP 10: Factory reset (seed sample data)
# ============================================================================
seed_database() {
    log_info "Seeding database with sample data..."

    # Wait a moment for backend to fully initialize
    sleep 2

    local response=$(curl -s -X POST http://127.0.0.1:8000/api/admin/reset)

    if echo "$response" | grep -q '"ok":true'; then
        log_success "Sample dataset loaded"
    else
        log_warn "Factory reset response: $response"
        log_warn "If the app shows no data, you can reset via: curl -X POST http://localhost/api/admin/reset"
    fi
}

# ============================================================================
# STEP 11: Summary and next steps
# ============================================================================
print_summary() {
    local server_ip
    server_ip=$(hostname -I | awk '{print $1}')
    [[ -z "$server_ip" ]] && server_ip="<server-ip-or-localhost>"

    echo ""
    echo -e "${GREEN}✓ Tally installation complete!${NC}"
    echo ""
    echo "Access your Tally instance at:"
    echo -e "  ${BLUE}http://$server_ip${NC}"
    echo "  (or http://localhost if installing on this machine)"
    echo ""
    echo "API documentation: http://$server_ip/docs"
    echo ""

    if [[ "$SYSTEMD_AVAILABLE" == "true" ]]; then
        echo "Service management (systemd):"
        echo "  Start:   sudo systemctl start tally-backend"
        echo "  Stop:    sudo systemctl stop tally-backend"
        echo "  Restart: sudo systemctl restart tally-backend"
        echo "  Status:  sudo systemctl status tally-backend"
        echo ""
        echo "Logs:"
        echo "  Backend: sudo tail -f /var/log/tally/backend.log"
        echo "  System:  sudo journalctl -u tally-backend -f"
    else
        echo -e "${GREEN}✓ Services running in background (non-systemd mode)${NC}"
        echo ""
        echo "Service management:"
        echo "  Check backend: curl http://localhost:8000/health"
        echo "  Check nginx:   curl http://localhost"
        echo ""
        echo "To restart services:"
        echo "  sudo bash $INSTALL_DIR/start-tally.sh"
        echo ""
        echo "To stop services manually:"
        echo "  sudo killall -f uvicorn"
        echo "  sudo killall nginx"
        echo ""
        echo "Logs (tail -f to watch live):"
        echo "  Backend: sudo tail -f /var/log/tally/backend.log"
        echo "  Nginx:   sudo tail -f /var/log/tally/nginx.log"
    fi
    echo ""
    echo "Uninstall:"
    echo "  sudo bash $INSTALL_DIR/uninstall.sh"
    echo ""
    echo "Documentation:"
    echo "  $INSTALL_DIR/INSTALL.md"
    echo ""
}

# ============================================================================
# MAIN
# ============================================================================
main() {
    echo ""
    echo -e "${BLUE}🚀 Tally Installer${NC}"
    echo ""

    preflight_checks
    install_system_deps
    setup_ollama
    setup_repository
    setup_tally_user
    setup_backend
    setup_frontend
    setup_systemd
    setup_nginx
    seed_database
    print_summary
}

main
