#!/usr/bin/env bash
# Calls one scheduled job of the store, as Vercel Cron would: GET with
# "Authorization: Bearer $CRON_SECRET". Used by the crontab that
# tools/cron/server-crontab.sh prints.
#
#   run-cron.sh <app-dir> <base-url> <job-path> [max-seconds]
#
# The secret is read from <app-dir>/.env at each run, so it never sits in the
# crontab and a changed secret is picked up without editing it. One line per
# run goes to <app-dir>/logs/cron.log: time, job, HTTP status, seconds.
set -u
app_dir="$1"; base_url="${2%/}"; job="$3"; max="${4:-120}"

secret="${CRON_SECRET:-}"
if [ -z "$secret" ] && [ -f "$app_dir/.env" ]; then
  secret="$(grep -E '^CRON_SECRET=' "$app_dir/.env" | tail -1 | cut -d= -f2- | tr -d '\r' | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')"
fi
mkdir -p "$app_dir/logs"
log="$app_dir/logs/cron.log"
if [ -z "$secret" ]; then
  echo "$(date -u +%FT%TZ) $job SKIPPED: CRON_SECRET not set in $app_dir/.env" >>"$log"
  exit 1
fi

# One run of a job at a time: a slow catalogue sync is not started twice.
lock="/tmp/storify-cron-$(echo "$job" | tr '/' '_').lock"
exec 9>"$lock"
if ! flock -n 9; then
  echo "$(date -u +%FT%TZ) $job SKIPPED: previous run still going" >>"$log"
  exit 0
fi

start=$(date +%s)
status=$(curl -sS -o /dev/null -w '%{http_code}' -m "$max" \
  -H "Authorization: Bearer $secret" "$base_url$job" 2>>"$log")
echo "$(date -u +%FT%TZ) $job $status $(( $(date +%s) - start ))s" >>"$log"
[ "$status" = "200" ]
