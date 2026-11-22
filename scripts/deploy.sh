#!/usr/bin/env bash
# ==============================================================================
# SARVYA Standalone Production Deployment & Safe Reload Script
# Can be run manually on the server or automatically via GitHub Actions CI/CD.
# ==============================================================================

set -euo pipefail

# ANSI color codes for clean terminal logging
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}==========================================================${NC}"
echo -e "${BLUE}   SARVYA Production Deployment & Zero-Downtime Reload   ${NC}"
echo -e "${BLUE}   Started at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')       ${NC}"
echo -e "${BLUE}==========================================================${NC}"

# 1. Resolve current directory to repository root
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"
echo -e "${GREEN}✓ Working Directory:${NC} $REPO_DIR"

# 2. Check for required commands
for cmd in git node npm pm2 curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo -e "${RED}Error: Required command '$cmd' is not installed or not in PATH.${NC}"
    exit 1
  fi
done

# 3. Pull latest changes from git
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'main')"
echo -e "${YELLOW}--> [1/6] Fetching and resetting to latest origin/${CURRENT_BRANCH}...${NC}"
git fetch origin "$CURRENT_BRANCH"
git reset --hard "origin/$CURRENT_BRANCH"
echo -e "${GREEN}✓ Git synchronized to commit: $(git rev-parse --short HEAD)${NC}"

# 4. Install backend dependencies
echo -e "${YELLOW}--> [2/6] Installing backend production dependencies...${NC}"
npm ci --omit=dev
echo -e "${GREEN}✓ Backend dependencies installed.${NC}"

# 5. Build frontend production assets
echo -e "${YELLOW}--> [3/6] Building frontend Vite bundle...${NC}"
npm --prefix frontend ci
npm --prefix frontend run build
if [ ! -f "frontend/dist/index.html" ]; then
  echo -e "${RED}Error: Frontend build failed, index.html not found!${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Frontend compiled successfully. (${REPO_DIR}/frontend/dist)${NC}"

# 6. Verify database schema & run auto-migrations
echo -e "${YELLOW}--> [4/6] Initializing and validating MySQL database schema...${NC}"
npm run db:init
echo -e "${GREEN}✓ Database schema verified.${NC}"

# 7. Reload PM2 processes gracefully with zero downtime
echo -e "${YELLOW}--> [5/6] Reloading PM2 processes (sarvya-api & sarvya-worker)...${NC}"
if pm2 describe sarvya-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --update-env
  echo -e "${GREEN}✓ PM2 processes reloaded with zero downtime.${NC}"
else
  pm2 start ecosystem.config.js
  echo -e "${GREEN}✓ PM2 processes started.${NC}"
fi
pm2 save

# 8. Post-deployment local health verification
echo -e "${YELLOW}--> [6/6] Verifying local service health...${NC}"
sleep 2
HTTP_PORT="${PORT:-5000}"
if curl -s -f -I "http://127.0.0.1:${HTTP_PORT}/robots.txt" >/dev/null 2>&1; then
  echo -e "${GREEN}✓ HTTP health check passed on port ${HTTP_PORT}.${NC}"
else
  echo -e "${YELLOW}! HTTP probe warning: port ${HTTP_PORT} did not respond immediately, please inspect pm2 logs.${NC}"
fi

echo ""
pm2 status
echo ""
echo -e "${GREEN}==========================================================${NC}"
echo -e "${GREEN}✓ SARVYA Production Deployment Completed Successfully!   ${NC}"
echo -e "${GREEN}==========================================================${NC}"
