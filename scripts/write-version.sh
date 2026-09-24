#!/bin/sh
# Run by Cloudflare Workers Builds (wrangler.jsonc "build.command") before each
# upload. Publishes the deployed commit at /version.txt so CI can confirm
# production is serving the latest push to main (.github/workflows/deploy-check.yml).
set -eu
sha="${WORKERS_CI_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
printf '%s\n' "$sha" > version.txt
