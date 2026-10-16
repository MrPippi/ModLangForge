#!/usr/bin/env bash
# 把 data/ 的變動推到 auto/track-versions，開或更新單一 PR。需要 GH_TOKEN；沒有變動時什麼都不做。
set -euo pipefail

SUMMARY="${1:?用法：open-tracking-pr.sh <summary.md>}"
BRANCH="auto/track-versions"
BASE="${BASE_BRANCH:-main}"

if [ -z "$(git status --porcelain -- data)" ]; then
  echo "沒有資料變動，不開 PR。"
  exit 0
fi

TITLE="chore(data): 追蹤模組新版本（$(date -u +%F)）"
BODY="$(mktemp)"
cp "$SUMMARY" "$BODY"
if [ "${HAS_TRACKER_TOKEN:-false}" != "true" ]; then
  printf '\n> 此 PR 由 GITHUB_TOKEN 建立，CI 不會自動執行；請關閉再重新開啟 PR 以觸發 CI。\n' >> "$BODY"
fi

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git checkout -B "$BRANCH"
git add data
git commit -m "$TITLE"
git push --force origin "$BRANCH"

EXISTING="$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number --jq '.[0].number // empty')"
if [ -n "$EXISTING" ]; then
  gh pr edit "$EXISTING" --title "$TITLE" --body-file "$BODY"
else
  gh pr create --base "$BASE" --head "$BRANCH" --title "$TITLE" --body-file "$BODY"
fi
