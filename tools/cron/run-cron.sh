#!/usr/bin/env bash
# Calls one scheduled job of the store, as Vercel Cron would: GET with
# "Authorization: Bearer $CRON_SECRET". Used by the crontab that
# tools/cron/server-crontab.sh prints.
#
#   run-cron.sh <app-dir> <base-url> <job-path> [max-seconds]
#
# The secret is read from <app-dir>/.env* (as Next reads them) at each run, so it never sits in the
# crontab and a changed secret is picked up without editing it. One line per
# run goes to <app-dir>/logs/cron.log: time, job, HTTP status, seconds.
set -u
app_dir="$1"; base_url="${2%/}"; job="$3"; max="${4:-120}"

# The env files in the order a production `next start` reads them: the first
# that sets CRON_SECRET is the one the app uses.
secret="${CRON_SECRET:-}"
for file in .env.production.local .env.local .env.production .env; do
  [ -n "$secret" ] && break
  [ -f "$app_dir/$file" ] || continue
  secret="$(grep -E '^[[:space:]]*(export[[:space:]]+)?CRON_SECRET=' "$app_dir/$file" | tail -1 | cut -d= -f2- | tr -d '\r' | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+|[[:space:]]+$//g; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')"
done
mkdir -p "$app_dir/logs"
log="$app_dir/logs/cron.log"
if [ -z "$secret" ]; then
  echo "$(date -u +%FT%TZ) $job SKIPPED: CRON_SECRET not set in the env files of $app_dir" >>"$log"
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
