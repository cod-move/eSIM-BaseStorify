#!/usr/bin/env bash
# Blue-green deployment of the store on one server, with pm2 and nginx.
#
#   bluegreen.sh deploy     build the idle copy, check it, switch nginx to it
#   bluegreen.sh rollback   switch back to the other copy (started if stopped)
#   bluegreen.sh status     which copy is live, and pm2's view of both
#   bluegreen.sh init       first time: make the two copies and shared folders
#
# Two checkouts, $ROOT/blue and $ROOT/green, each with its own build, run by
# pm2 on their own port. nginx sends traffic to the live one through an
# upstream whose one line ($ACTIVE_CONF) this script rewrites and reloads:
# a reload lets requests in flight finish, so nobody sees an error. The live
# copy is never touched while the other builds; a build or check that fails
# leaves it serving.
#
# Shared by both copies (symlinks into $ROOT/shared): .env, logs/ and
# public/uploads (files saved when storage is local).
#
# Settings come from $ROOT/deploy.env (see tools/deploy/README.md), else the
# defaults below.
set -euo pipefail

# The script lives in one of the two copies, and a deploy may reset that copy
# while bash is still reading it: run a private copy instead.
if [ -z "${BLUEGREEN_COPY:-}" ]; then
  copy="$(mktemp /tmp/bluegreen.XXXXXX.sh)"
  cp "$0" "$copy"
  BLUEGREEN_COPY="$copy" exec bash "$copy" "$@"
fi
trap 'rm -f "$BLUEGREEN_COPY"' EXIT

ROOT="${ROOT:-/www/wwwroot/codsim}"
[ -f "$ROOT/deploy.env" ] && . "$ROOT/deploy.env"

REPO="${REPO:-}"                                   # git URL, for init only
BRANCH="${BRANCH:-main}"
APP_SUBDIR="${APP_SUBDIR:-Storify-main-app}"
BLUE_PORT="${BLUE_PORT:-3001}"
GREEN_PORT="${GREEN_PORT:-3002}"
PM2_PREFIX="${PM2_PREFIX:-codsim}"
ACTIVE_CONF="${ACTIVE_CONF:-/etc/nginx/codsim-active.conf}"
HEALTH_PATH="${HEALTH_PATH:-/api/settings/public}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"            # seconds for the new copy to answer
DRAIN="${DRAIN:-330}"                              # seconds the old copy keeps running after the switch
BUILD_NICE="${BUILD_NICE:-10}"                     # build at lower CPU priority than the live site
NODE_BIN="${NODE_BIN:-}"                           # e.g. /www/server/nodejs/v24.11.1/bin (BaoTa)
NGINX="${NGINX:-}"                                 # e.g. /www/server/nginx/sbin/nginx (BaoTa)

# BaoTa keeps node and nginx off the usual PATH.
[ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
if [ -z "$NGINX" ]; then
  NGINX="$(command -v nginx 2>/dev/null || true)"
  [ -z "$NGINX" ] && [ -x /www/server/nginx/sbin/nginx ] && NGINX=/www/server/nginx/sbin/nginx
fi

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*"; exit 1; }

port_of() { [ "$1" = blue ] && echo "$BLUE_PORT" || echo "$GREEN_PORT"; }
other_of() { [ "$1" = blue ] && echo green || echo blue; }
live() { cat "$ROOT/live" 2>/dev/null || echo none; }
app_dir() { echo "$ROOT/$1/$APP_SUBDIR"; }

link_shared() {
  local dir; dir="$(app_dir "$1")"
  mkdir -p "$ROOT/shared/logs" "$ROOT/shared/uploads" "$dir/public"
  [ -f "$ROOT/shared/.env" ] || die "missing $ROOT/shared/.env"
  ln -sfn "$ROOT/shared/.env" "$dir/.env"
  if [ -e "$dir/logs" ] && [ ! -L "$dir/logs" ]; then rm -rf "$dir/logs"; fi
  ln -sfn "$ROOT/shared/logs" "$dir/logs"
  if [ -e "$dir/public/uploads" ] && [ ! -L "$dir/public/uploads" ]; then
    cp -an "$dir/public/uploads/." "$ROOT/shared/uploads/" && rm -rf "$dir/public/uploads"
  fi
  ln -sfn "$ROOT/shared/uploads" "$dir/public/uploads"
}

point_nginx() {
  local port="$1" tmp
  tmp="$(mktemp)"
  printf 'server 127.0.0.1:%s;\n' "$port" > "$tmp"
  cp "$ACTIVE_CONF" "$ACTIVE_CONF.bak" 2>/dev/null || true
  cat "$tmp" > "$ACTIVE_CONF"; rm -f "$tmp"
  if ! "$NGINX" -t >/dev/null 2>&1; then
    [ -f "$ACTIVE_CONF.bak" ] && cat "$ACTIVE_CONF.bak" > "$ACTIVE_CONF"
    die "nginx -t failed; nginx left as it was"
  fi
  "$NGINX" -s reload
}

healthy() {
  local port="$1" waited=0
  until curl -fsS -o /dev/null --max-time 10 "http://127.0.0.1:$port$HEALTH_PATH"; do
    waited=$((waited + 3))
    [ "$waited" -ge "$HEALTH_TIMEOUT" ] && return 1
    sleep 3
  done
}

start_copy() {
  local copy="$1" port name
  port="$(port_of "$copy")"; name="$PM2_PREFIX-$copy"
  if pm2 describe "$name" >/dev/null 2>&1; then
    pm2 restart "$name" --update-env >/dev/null
  else
    pm2 start "$(command -v pnpm)" --name "$name" --cwd "$(app_dir "$copy")" -- start -p "$port" >/dev/null
  fi
  pm2 save >/dev/null
}

cmd_init() {
  [ -n "$REPO" ] || die "set REPO in $ROOT/deploy.env"
  mkdir -p "$ROOT/shared"
  for copy in blue green; do
    [ -d "$ROOT/$copy/.git" ] || git clone --branch "$BRANCH" "$REPO" "$ROOT/$copy"
  done
  log "Now put the store's .env at $ROOT/shared/.env, set up nginx (README), then run: $0 deploy"
}

preflight() {
  command -v pnpm >/dev/null || die "pnpm not found: set NODE_BIN in $ROOT/deploy.env"
  command -v pm2 >/dev/null || die "pm2 not found: npm i -g pm2 (with the same node as NODE_BIN)"
  [ -n "$NGINX" ] && [ -x "$NGINX" ] || die "nginx not found: set NGINX in $ROOT/deploy.env"
  [ -f "$ACTIVE_CONF" ] || die "missing $ACTIVE_CONF (see README)"
}

cmd_deploy() {
  local current target port dir old_static
  preflight
  current="$(live)"
  if [ "$current" = none ]; then target=blue; else target="$(other_of "$current")"; fi
  port="$(port_of "$target")"; dir="$(app_dir "$target")"
  log "live: $current; building $target (port $port)"

  git -C "$ROOT/$target" fetch --quiet origin "$BRANCH"
  git -C "$ROOT/$target" reset --quiet --hard "origin/$BRANCH"
  log "code at $(git -C "$ROOT/$target" log --oneline -1)"
  link_shared "$target"

  (cd "$dir" && pnpm install --frozen-lockfile --prefer-offline >/dev/null)
  (cd "$dir" && nice -n "$BUILD_NICE" pnpm build) || die "build failed; $current still live"

  # Pages already open in a browser ask for the old build's script files:
  # they are named by their content, so the old ones are kept beside the new.
  if [ "$current" != none ]; then
    old_static="$(app_dir "$current")/.next/static"
    [ -d "$old_static" ] && cp -an "$old_static/." "$dir/.next/static/"
  fi

  start_copy "$target"
  healthy "$port" || { pm2 stop "$PM2_PREFIX-$target" >/dev/null; die "$target did not answer on $port; $current still live"; }
  log "$target answers; switching nginx"
  point_nginx "$port"
  echo "$target" > "$ROOT/live"
  ln -sfn "$ROOT/$target" "$ROOT/current"
  log "live: $target"

  if [ "$current" != none ]; then
    log "keeping $current up ${DRAIN}s for requests and jobs it is running"
    sleep "$DRAIN"
    pm2 stop "$PM2_PREFIX-$current" >/dev/null && pm2 save >/dev/null
    log "stopped $current (kept for rollback: $0 rollback)"
  fi
}

cmd_rollback() {
  local current target port
  preflight
  current="$(live)"; [ "$current" = none ] && die "nothing deployed yet"
  target="$(other_of "$current")"; port="$(port_of "$target")"
  log "rolling back to $target ($(git -C "$ROOT/$target" log --oneline -1))"
  pm2 describe "$PM2_PREFIX-$target" 2>/dev/null | grep -q "status.*online" || start_copy "$target"
  healthy "$port" || die "$target did not answer on $port; $current still live"
  point_nginx "$port"
  echo "$target" > "$ROOT/live"
  ln -sfn "$ROOT/$target" "$ROOT/current"
  log "live: $target; $current left running, stop it with: pm2 stop $PM2_PREFIX-$current"
}

cmd_status() {
  local current; current="$(live)"
  echo "live: $current"
  for copy in blue green; do
    [ -d "$ROOT/$copy/.git" ] && echo "$copy (port $(port_of "$copy")): $(git -C "$ROOT/$copy" log --oneline -1)"
  done
  pm2 ls | grep -E "$PM2_PREFIX-(blue|green)|name" || true
}

case "${1:-}" in
  deploy)
    command -v flock >/dev/null || die "flock not found (util-linux)"
    exec 9>"$ROOT/.deploy.lock"; flock -n 9 || die "a deploy is already running"
    cmd_deploy ;;
  rollback) cmd_rollback ;;
  status) cmd_status ;;
  init) cmd_init ;;
  *) sed -n '2,8p' "$BLUEGREEN_COPY"; exit 2 ;;
esac
