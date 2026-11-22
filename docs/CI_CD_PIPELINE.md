# SARVYA CI/CD Pipeline & Deployment Guide

This document describes the automated Continuous Integration (CI) and Continuous Deployment (CD) pipeline for **SARVYA** using GitHub Actions and PM2.

---

## 1. Pipeline Architecture

```
                    ┌──────────────────────────────┐
                    │ Push / PR to 'main' branch   │
                    └──────────────┬───────────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 │                                   │
                 ▼                                   ▼
    ┌─────────────────────────┐         ┌─────────────────────────┐
    │     frontend-build      │         │      backend-test       │
    │  - Node.js 20.x         │         │  - Node.js 20.x         │
    │  - npm --prefix ci      │         │  - MySQL 8.4 Service    │
    │  - Oxlint static check  │         │  - npm ci               │
    │  - Vite production build│         │  - npm run db:init      │
    │  - Artifact upload      │         │  - test_fresh_deployment│
    └────────────┬────────────┘         │  - Master QA Suite      │
                 │                      └────────────┬────────────┘
                 │                                   │
                 └─────────────────┬─────────────────┘
                                   │ (Both Succeed on 'main')
                                   ▼
                    ┌──────────────────────────────┐
                    │      deploy (Production)     │
                    │  - SSH into Production VPS   │
                    │  - git reset --hard main     │
                    │  - npm ci && vite build      │
                    │  - db:init auto-migrations   │
                    │  - pm2 reload zero-downtime  │
                    │  - HTTP health verification  │
                    └──────────────────────────────┘
```

---

## 2. GitHub Actions Workflow Configuration

The workflow is defined at:
`.github/workflows/ci-cd.yml`

### Triggers
- **Push to `main`**: Runs the complete CI pipeline and automatically deploys to production.
- **Pull Request to `main`**: Runs the frontend build and backend MySQL tests in parallel to block regressions before merge.
- **Manual Trigger (`workflow_dispatch`)**: Allows manual execution from the GitHub Actions UI tab with optional parameters (e.g. emergency hotfix test bypass).

---

## 3. GitHub Secrets Configuration (For Automated CD)

To enable automatic SSH deployment to your VPS, add the following repository secrets in GitHub:

**Navigate to:** `GitHub Repository -> Settings -> Secrets and variables -> Actions -> New repository secret`

| Secret Name | Required | Example Value | Description |
|---|---|---|---|
| `SSH_HOST` | **Yes** | `survya.flex-us.in` or `123.45.67.89` | Your server hostname or public IP address |
| `SSH_USER` | **Yes** | `ubuntu` or `root` | The SSH username on the server |
| `SSH_KEY` | **Yes** | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Private SSH key (without passphrase) |
| `SSH_PORT` | No | `22` (default) | Custom SSH port if changed |
| `DEPLOY_PATH` | No | `/var/www/whatsapp_bulk` (default) | Absolute path to the repository on your server |

> [!NOTE]
> If these secrets are not configured yet, the pipeline will still run all frontend and backend tests, and gracefully skip the remote SSH step with a helpful reminder.

---

## 4. Setting Up SSH Keys on Your Server (One-Time Setup)

### Step 1: Generate a dedicated deploy key pair on your local machine or server:
```bash
ssh-keygen -t ed25519 -C "github-actions-sarvya-deploy" -f ~/.ssh/sarvya_deploy -N ""
```

### Step 2: Add the public key to your server's authorized_keys:
```bash
cat ~/.ssh/sarvya_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### Step 3: Copy the private key into GitHub Secrets:
```bash
cat ~/.ssh/sarvya_deploy
```
Copy the full output (including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`) into GitHub Actions secret **`SSH_KEY`**.

---

## 5. Server Environment & PM2 Configuration

The server runs using PM2 via `ecosystem.config.js`:
- **`sarvya-api`**: Main Express HTTP server (`server.js`) on port 5000.
- **`sarvya-worker`**: Transactional background job queue worker (`worker.js`).

### Manual Deployment on Server
A standalone deployment script is included at [scripts/deploy.sh](file:///d:/whatsapp_bulk/scripts/deploy.sh):
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### Inspecting Live Production Status
```bash
# Check status of API and Worker processes
pm2 status

# Stream live production logs
pm2 logs sarvya-api
pm2 logs sarvya-worker

# Monitor memory and CPU in real time
pm2 monit
```

---

## 6. Zero-Downtime Guarantee & Safety Directives
- **Zero Live Messages Rule**: All automated CI tests run against sandboxed mock adapters (`isSimulation: true`), strictly prohibiting dispatching live WhatsApp messages or invoking external Meta Graph APIs.
- **Atomic Migrations**: `npm run db:init` checks and validates all 94 database tables before PM2 triggers process reload.
- **Graceful Reload**: `pm2 reload ecosystem.config.js` keeps existing connections alive while new worker processes initialize.
