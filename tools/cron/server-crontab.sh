#!/usr/bin/env bash
# Prints the crontab that runs the store's scheduled jobs on your own server:
# every "crons" entry of Storify-main-app/vercel.json (Storify's jobs and the
# eSIM ones: esim-fulfillment, esim-catalog, esim-fx, esim-usage), each through
# tools/cron/run-cron.sh.
#
#   tools/cron/server-crontab.sh <app-dir> [base-url]
#
#   <app-dir>   the deployed Storify-main-app (holds .env with CRON_SECRET)
#   [base-url]  where the app answers on this server; default
#               http://127.0.0.1:3000 — straight to Next, not through the
#               proxy, whose timeout would cut the 5-minute catalogue sync
#
# Install (replaces the user's crontab; keep other entries by merging):
#   tools/cron/server-crontab.sh /srv/codsim/Storify-main-app > /tmp/storify.cron
#   crontab /tmp/storify.cron
# Run again after a deploy whose vercel.json changed.
#
# CRON_SKIP="esim-fulfillment" leaves out jobs that tools/cron/loop.sh runs
# more often than once a minute (see tools/cron/README.md).
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
app_dir="$(cd "${1:?usage: server-crontab.sh <app-dir> [base-url]}" && pwd)"
base_url="${2:-http://127.0.0.1:3000}"

echo "# Storify scheduled jobs, from $app_dir/vercel.json ($(date -u +%F))."
echo "# Times are UTC, as on Vercel (CRON_TZ needs cronie; elsewhere set the server to UTC)."
echo "CRON_TZ=UTC"
echo "SHELL=/bin/bash"
echo "PATH=/usr/local/bin:/usr/bin:/bin"
node -e '
  const [file, runner, app, base] = process.argv.slice(1);
  // Jobs run by tools/cron/loop.sh instead (CRON_SKIP="esim-fulfillment other-job").
  const skip = new Set((process.env.CRON_SKIP || "").split(/[\s,]+/).filter(Boolean).map((job) => `/api/cron/${job}`));
  // How long each job may take: its route maxDuration plus a margin.
  const fs = require("fs");
  for (const { path, schedule } of JSON.parse(fs.readFileSync(file, "utf8")).crons) {
    if (skip.has(path)) {
      console.log(`# ${path}: run by tools/cron/loop.sh`);
      continue;
    }
    let max = 60;
    try {
      const m = /maxDuration\s*=\s*(\d+)/.exec(fs.readFileSync(`${app}/app${path}/route.ts`, "utf8"));
      if (m) max = Number(m[1]);
    } catch {}
    console.log(`${schedule} ${runner} ${app} ${base} ${path} ${max + 30}`);
  }
' "$app_dir/vercel.json" "$here/run-cron.sh" "$app_dir" "$base_url"
