#!/usr/bin/env bash
# ==============================================================================
# Deployment is deliberately disabled in this repository.
# Running a production worker could dispatch live WhatsApp messages, which is
# prohibited by the repository safety policy. Use approved human-operated
# deployment procedures outside this script.
# ==============================================================================

set -euo pipefail

echo "Deployment is disabled: this repository must not start or reload services that may send live WhatsApp messages." >&2
exit 1
