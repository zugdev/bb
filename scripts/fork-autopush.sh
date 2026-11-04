#!/bin/sh
set -u

repo="${BB_FORK_REPO:-$HOME/prog/bb}"
dry_run="${1:-}"
cd "$repo" || exit 1

case "$(git remote get-url origin)" in
  *zugdev/bb*) ;;
  *) echo "origin is not the zugdev/bb fork, nothing pushed"; exit 1 ;;
esac

git fetch -q origin
main_sha="$(git rev-parse main)"
failed=0

for branch in $(git for-each-ref --format='%(refname:short)' refs/heads); do
  case "$branch" in
    main | worktree-agent-*) continue ;;
  esac
  local_sha="$(git rev-parse "$branch")"
  [ "$local_sha" = "$main_sha" ] && continue
  remote_sha="$(git rev-parse -q --verify "refs/remotes/origin/$branch" || true)"
  [ "$local_sha" = "$remote_sha" ] && continue
  if [ "$dry_run" = "--dry-run" ]; then
    echo "would push $branch ($local_sha)"
  elif git push -q origin "refs/heads/$branch:refs/heads/$branch"; then
    echo "pushed $branch"
  else
    echo "push failed for $branch, it probably diverged from origin/$branch"
    failed=1
  fi
done

exit "$failed"
