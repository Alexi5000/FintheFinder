#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required to close stale dependency PRs." >&2
  exit 1
fi

gh pr list --state open --label dependencies --json number,updatedAt,title \
  --jq '.[] | select((now - (.updatedAt | fromdateiso8601)) > (14 * 24 * 60 * 60)) | [.number, .title] | @tsv' |
while IFS=$'\t' read -r number title; do
  [ -z "${number:-}" ] && continue
  gh pr close "$number" --comment "Closing stale dependency PR after 14 days without updates. Please reopen or supersede with a fresh dependency batch if still needed."
  echo "Closed stale dependency PR #$number: $title"
done
