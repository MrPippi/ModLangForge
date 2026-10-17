#!/usr/bin/env bash
# 把 data/ 的變動推到自動分支，開或更新單一 PR。需要 GH_TOKEN；沒有變動時什麼都不做。
# 可用環境變數指定：TRACK_BRANCH（預設 auto/track-versions，必須以 auto/ 開頭）、TRACK_TITLE（預設「chore(data): 追蹤模組新版本」）。
set -euo pipefail

SUMMARY="${1:?用法：open-tracking-pr.sh <summary.md>}"
BRANCH="${TRACK_BRANCH:-auto/track-versions}"
TITLE_PREFIX="${TRACK_TITLE:-chore(data): 追蹤模組新版本}"
BASE="${BASE_BRANCH:-main}"

# 會 force-push，只允許自動分支
case "$BRANCH" in
  auto/*) ;;
  *) echo "TRACK_BRANCH 必須以 auto/ 開頭：$BRANCH" >&2; exit 1 ;;
esac

if [ -z "$(git status --porcelain -- data)" ]; then
  echo "沒有資料變動，不開 PR。"
  exit 0
fi

TITLE="${TITLE_PREFIX}（$(date -u +%F)）"
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
# checkout 未保存憑證；只在這個指令帶入 token
AUTH="$(printf 'x-access-token:%s' "${GH_TOKEN:?需要 GH_TOKEN}" | base64 | tr -d '\n')"
git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $AUTH" push --force origin "$BRANCH"

EXISTING="$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number --jq '.[0].number // empty')"
if [ -n "$EXISTING" ]; then
  gh pr edit "$EXISTING" --title "$TITLE" --body-file "$BODY"
else
  gh pr create --base "$BASE" --head "$BRANCH" --title "$TITLE" --body-file "$BODY"
fi
