#!/usr/bin/env bash
# Runs one scheduled job every <seconds>, for jobs that need more often than
# cron's once a minute (esim-fulfillment: supplier polls come due every 30 s).
# Meant to be kept running by supervisor or systemd; see tools/cron/README.md.
#
#   loop.sh <seconds> <app-dir> <base-url> <job-path> [max-seconds]
#
# Each run starts <seconds> after the previous one started, or at once when a
# run took longer. Runs never overlap. Logs to <app-dir>/logs/cron.log.
set -u
every="$1"; shift
runner="$(cd "$(dirname "$0")" && pwd)/run-cron.sh"
trap 'exit 0' TERM INT
while true; do
  start=$(date +%s)
  bash "$runner" "$@" || true
  left=$(( every - ($(date +%s) - start) ))
  [ "$left" -gt 0 ] && sleep "$left" & wait $!
done
