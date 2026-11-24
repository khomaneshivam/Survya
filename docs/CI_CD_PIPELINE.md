# SARVYA CI Pipeline Guide

This document describes the offline-only Continuous Integration (CI) pipeline for **SARVYA**. Automated deployment is intentionally disabled because this repository must never start, reload, or otherwise enable a service that could dispatch a live WhatsApp message.

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
                    │     CI result published      │
                    │  - No SSH connections        │
                    │  - No PM2 commands           │
                    │  - No production deployment  │
                    └──────────────────────────────┘
```

---

## 2. GitHub Actions Workflow Configuration

The workflow is defined at:
`.github/workflows/ci-cd.yml`

### Triggers
- **Push to `main`**: Runs the complete offline CI pipeline.
- **Pull Request to `main`**: Runs the frontend build and backend MySQL tests in parallel to block regressions before merge.
- **Manual Trigger (`workflow_dispatch`)**: Runs the same required offline validation from the GitHub Actions UI.

---

## 3. Safety Directives

- **No automated deployment**: The workflow has no SSH, PM2, or production-service steps. `scripts/deploy.sh` fails closed and cannot deploy.
- **No live messaging**: CI uses local MySQL and deliberately invalid local Meta API settings; tests must use mocks or `isSimulation: true`.
- **Required validation**: Lint, frontend build, schema initialization, fresh-database checks, and the regression suite must pass. Tests cannot be bypassed from the manual workflow trigger.
- **Human-operated production changes**: Any authorized production operation must be performed separately by an approved operator from an appropriate environment, after an explicit review. It is outside this repository's automation.
