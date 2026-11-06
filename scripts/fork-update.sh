#!/bin/sh
set -eu

repo="$(cd "$(dirname "$0")/.." && pwd)"
app="$repo/apps/desktop/release/mac-arm64/bb.app"
installed=/Applications/bb.app
staged=/Applications/bb.app.new
previous="$HOME/.bb/bb.app.prev"
installed_commit="$HOME/.bb/fork-updater-installed-commit"
swap_failed="$HOME/.bb/fork-updater-swap-failed"
lock="$HOME/.bb/fork-update.lock"
builtin_plugins=Contents/Resources/app.asar.unpacked/node_modules/bb-app/server/dist/builtin-plugins
app_binary="$installed/Contents/MacOS/bb"
server_url=http://127.0.0.1:38886/api/v1/threads
owned_runtime="$HOME/Library/Application Support/bb/owned-runtime.json"
cd "$repo"

unset ELECTRON_RUN_AS_NODE

pull=false
build=true
reopen=true
for arg in "$@"; do
  case "$arg" in
    --pull) pull=true ;;
    --swap) build=false ;;
    --no-reopen) reopen=false ;;
    --verify)
      verify_only=true
      build=false
      ;;
    *)
      echo "usage: $0 [--pull] [--swap] [--no-reopen] [--verify]" >&2
      exit 2
      ;;
  esac
done

fail() {
  echo "ERROR: $1" >&2
  printf '%s\n' "$1" > "$swap_failed"
  exit 1
}

verify_bundled_plugins() {
  stale=""
  for dir in "$1/$builtin_plugins"/*/; do
    name="$(basename "$dir")"
    runtime="$repo/plugins/$name/.bundled-runtime"
    if [ ! -d "$runtime" ] || ! diff -rq "$runtime" "$dir" >/dev/null; then
      stale="$stale $name"
    fi
  done
  if [ -n "$stale" ]; then
    echo "ERROR: bundled plugins in $1 differ from plugins/<name>/.bundled-runtime:$stale" >&2
    return 1
  fi
}

if [ "${verify_only:-false}" = true ]; then
  verify_bundled_plugins "$app"
  exit 0
fi

until mkdir "$lock" 2>/dev/null; do
  echo "waiting for another fork:update to finish (remove $lock if none is running)"
  sleep 5
done
trap 'rmdir "$lock"' EXIT

if $pull; then
  git -C "$repo" pull --ff-only
fi

if $build; then
  pnpm -C "$repo" install --frozen-lockfile
  NODE_ENV=production pnpm -C "$repo" exec dotenv --no-expand -c production -- turbo run package --filter=@bb/desktop --output-logs=new-only
fi

rm -f "$swap_failed"
verify_bundled_plugins "$app" || fail "bundled plugins in $app differ from their .bundled-runtime build, see the fork-updater log"
commit="$(git -C "$repo" rev-parse HEAD)"

rm -rf "$staged"
ditto "$app" "$staged"
test -x "$staged/Contents/MacOS/bb"

app_running() {
  pgrep -xf "$app_binary" >/dev/null
}

server_answers() {
  curl -sf -o /dev/null --max-time 2 "$server_url"
}

stop_background_runtime() {
  pid="$(sed -n 's/^ *"pid": *\([0-9][0-9]*\).*/\1/p' "$owned_runtime" 2>/dev/null || true)"
  if [ -n "$pid" ] && ps -p "$pid" -o command= | grep -qF "bb-app-bridge.mjs"; then
    echo "stopping the bb runtime that keeps agents running after quit"
    kill "$pid" || true
  fi
}

quit_bb() {
  echo "quitting bb"
  osascript -e 'quit app "bb"' 2>/dev/null || true
  waited=0
  runtime_stopped=false
  while app_running || server_answers; do
    if ! $runtime_stopped && ! app_running; then
      stop_background_runtime
      runtime_stopped=true
    fi
    if [ "$waited" -eq 60 ]; then
      echo "bb still running after 60s, sending SIGTERM"
      pkill -xf "$app_binary" || true
    fi
    if [ "$waited" -ge 90 ]; then
      pgrep -fl "^$app_binary" || true
      fail "bb did not quit within 90s, nothing was installed"
    fi
    sleep 1
    waited=$((waited + 1))
  done
}

quit_bb
rm -rf "$previous"
if [ -d "$installed" ]; then mv "$installed" "$previous"; fi
mv "$staged" "$installed"

if ! $reopen; then
  cmp -s "$app/Contents/Resources/app.asar" "$installed/Contents/Resources/app.asar" \
    && verify_bundled_plugins "$installed" \
    || fail "$installed does not match the build at $app"
  printf '%s\n' "$commit" > "$installed_commit"
  echo "installed $commit, bb stays closed"
  exit 0
fi

echo "opening $installed"
open "$installed"
if ! curl -sf -o /dev/null --retry 30 --retry-connrefused --retry-delay 2 "$server_url" \
  || ! app_running \
  || ! cmp -s "$app/Contents/Resources/app.asar" "$installed/Contents/Resources/app.asar" \
  || ! verify_bundled_plugins "$installed"; then
  echo "new bb.app is not running from $installed at $commit, restoring $previous"
  quit_bb
  rm -rf "$installed"
  mv "$previous" "$installed"
  open "$installed"
  fail "the new bb.app did not start after the swap, so the previous bb.app was restored"
fi
printf '%s\n' "$commit" > "$installed_commit"
echo "installed $commit and reopened bb"
