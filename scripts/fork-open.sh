#!/bin/sh
set -u

repo="$(cd "$(dirname "$0")/.." && pwd)"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi
stamp_file="$HOME/.bb/fork-build-stamp"

notify() {
  osascript -e "display notification \"$1\" with title \"bb\"" 2>/dev/null || true
}

if pgrep -xq bb; then
  open -a /Applications/bb.app
  exit 0
fi

stamp="$(
  {
    git -C "$repo" rev-parse HEAD
    git -C "$repo" status --porcelain
    git -C "$repo" ls-files -m -o --exclude-standard -z |
      (cd "$repo" && xargs -0 shasum 2>/dev/null)
  } | shasum | cut -d' ' -f1
)"

if [ "$stamp" != "$(cat "$stamp_file" 2>/dev/null)" ]; then
  notify "Updating bb from your checkout. This takes about a minute."
  if sh "$repo/scripts/fork-update.sh"; then
    mkdir -p "$(dirname "$stamp_file")"
    printf '%s\n' "$stamp" > "$stamp_file"
    exit 0
  fi
  notify "Update failed, opening the previous build. Log: ~/.bb/logs/fork-open.log"
fi

open -a /Applications/bb.app
