#!/bin/sh
set -eu

repo="$(cd "$(dirname "$0")/.." && pwd)"
app="$repo/apps/desktop/release/mac-arm64/bb.app"
cd "$repo"

if [ "${1:-}" = "--pull" ]; then
  git -C "$repo" pull --ff-only
fi

osascript -e 'quit app "bb"' 2>/dev/null || true
while pgrep -xq bb; do sleep 1; done

pnpm -C "$repo" install --frozen-lockfile
NODE_ENV=production pnpm -C "$repo" exec dotenv --no-expand -c production -- turbo run package --filter=@bb/desktop --output-logs=new-only

rm -rf /Applications/bb.app
cp -R "$app" /Applications/bb.app
open /Applications/bb.app
