#!/bin/sh
set -eu

repo="$(cd "$(dirname "$0")/.." && pwd)"
app="$repo/apps/desktop/release/mac-arm64/bb.app"
installed=/Applications/bb.app
staged=/Applications/bb.app.new
previous="$HOME/.bb/bb.app.prev"
lock="$HOME/.bb/fork-update.lock"
cd "$repo"

until mkdir "$lock" 2>/dev/null; do
  echo "waiting for another fork:update to finish (remove $lock if none is running)"
  sleep 5
done
trap 'rmdir "$lock"' EXIT

if [ "${1:-}" = "--pull" ]; then
  git -C "$repo" pull --ff-only
fi

pnpm -C "$repo" install --frozen-lockfile
NODE_ENV=production pnpm -C "$repo" exec dotenv --no-expand -c production -- turbo run package --filter=@bb/desktop --output-logs=new-only

rm -rf "$staged"
ditto "$app" "$staged"
test -x "$staged/Contents/MacOS/bb"

quit_bb() {
  osascript -e 'quit app "bb"' 2>/dev/null || true
  while pgrep -xq bb; do sleep 1; done
}

quit_bb
rm -rf "$previous"
if [ -d "$installed" ]; then mv "$installed" "$previous"; fi
mv "$staged" "$installed"
open "$installed"

if ! curl -sf -o /dev/null --retry 30 --retry-connrefused --retry-delay 2 http://127.0.0.1:38886/api/v1/threads; then
  echo "new bb.app did not answer on :38886, restoring $previous"
  quit_bb
  rm -rf "$installed"
  mv "$previous" "$installed"
  open "$installed"
  exit 1
fi
