#!/usr/bin/env bash
# Deploy the site on the Pi: pull the latest from GitHub, refresh Orchestrate's merge data in
# data.js and restart the server so the new numbers show. Run it from the server's site checkout,
# by hand to deploy, or every morning from the systemd timer described in the README.
#   SERVER_SERVICE=<unit> tools/deploy.sh
set -euo pipefail

service="${SERVER_SERVICE:?Set SERVER_SERVICE to the systemd unit that runs the server}"
cd "$(dirname "$0")/.."

# MERGES is regenerated here every day, so drop yesterday's copy before pulling
git checkout -- data.js
git pull --ff-only -q
node tools/update-merges-data.mjs data.js
sudo systemctl restart "$service"
