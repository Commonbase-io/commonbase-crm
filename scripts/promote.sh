#!/usr/bin/env bash
# Fast-forward main to jake-dev after CI is green on jake-dev.
# Do not commit directly to main.
set -euo pipefail
cd "$(dirname "$0")/.."

git fetch origin
git checkout main
git pull --ff-only origin main
git merge --ff-only origin/jake-dev
git push origin main
git checkout jake-dev
echo "Promoted jake-dev onto main."
