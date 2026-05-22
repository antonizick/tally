#!/bin/bash
# Tally Uninstaller
# Removes Tally installation, optionally removing data

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
    read -p "$(echo -e ${YELLOW}?)${NC} $prompt [y/N]: " -r response
    [[ "$response" =~ ^[Yy]$ ]]
}

# ============================================================================
# Check for systemd availability
# ============================================================================
check_systemd() {
    if [[ -e /run/systemd/system ]] && systemctl --version >/dev/null 2>&1; then
        return 0  # systemd is available
    else
        return 1  # systemd not available
    fi
}

# ============================================================================
# MAIN UNINSTALL
# ============================================================================
main() {
    echo ""
    echo -e "${BLUE}🗑️  Tally Uninstaller${NC}"
    echo ""

    # Check if root
    if [[ $EUID -ne 0 ]]; then
        die "This script must be run as root (use: sudo bash uninstall.sh)"
    fi

    # Confirmation
    echo "This will remove the Tally installation from $INSTALL_DIR"
    echo ""
    if ! confirm "Continue with uninstall?"; then
        echo "Uninstall cancelled"
        exit 0
    fi

    # Stop and disable service
    log_info "Stopping Tally services..."

    if check_systemd; then
        # systemd environment
        systemctl stop tally-backend 2>/dev/null || true
        systemctl disable tally-backend 2>/dev/null || true
        rm -f /etc/systemd/system/tally-backend.service
        systemctl daemon-reload 2>/dev/null || true
        log_success "systemd service stopped and disabled"
    else
        # Non-systemd environment - kill processes manually
        if [[ -f "$LOG_DIR/backend.pid" ]]; then
            local backend_pid=$(cat "$LOG_DIR/backend.pid" 2>/dev/null)
            if [[ -n "$backend_pid" ]] && kill -0 "$backend_pid" 2>/dev/null; then
                kill "$backend_pid" 2>/dev/null || true
                log_success "Backend process terminated"
            fi
            rm -f "$LOG_DIR/backend.pid"
        fi

        # Kill any remaining uvicorn processes
        pkill -f "uvicorn.*tally" 2>/dev/null || true

        log_success "Services stopped (non-systemd mode)"
    fi

    # Disable nginx
    log_info "Disabling nginx site..."
    rm -f /etc/nginx/sites-enabled/tally /etc/nginx/sites-available/tally

    if check_systemd; then
        systemctl reload nginx 2>/dev/null || true
    else
        # In non-systemd, nginx may be running as standalone process
        # Try to reload if it's running, otherwise just clean up config
        nginx -t >/dev/null 2>&1 && nginx -s reload 2>/dev/null || true
    fi
    log_success "Nginx site removed"

    # Remove installation
    log_info "Removing Tally installation..."
    rm -rf "$INSTALL_DIR"
    log_success "Installation removed"

    # Offer to remove data
    echo ""
    echo "Data directory: $DATA_DIR"
    echo "WARNING: This cannot be undone!"
    echo ""
    if confirm "Delete all data in $DATA_DIR?"; then
        log_warn "Deleting data..."
        userdel "$TALLY_USER" 2>/dev/null || true
        rm -rf "$DATA_DIR" "$LOG_DIR"
        log_success "Data deleted"
    else
        log_info "Data preserved at $DATA_DIR"
        log_info "To clean up later: sudo rm -rf $DATA_DIR $LOG_DIR && sudo userdel tally"
    fi

    echo ""
    echo -e "${GREEN}✓ Uninstall complete${NC}"
    echo ""
}

main
