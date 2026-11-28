#!/usr/bin/env bash
# 追蹤 PR 還開著時，把它分支上手動補翻或修正的譯文搬回這次的追蹤結果（open-tracking-pr.sh 會強制推送覆蓋該分支）。
# PR 已合併或關閉時不搬：關閉代表譯文被否決，合併後 main 已經有這些譯文。
# 需要 GH_TOKEN；可用 TRACK_BRANCH（預設 auto/track-versions）、BASE_BRANCH（預設 main）指定。
set -euo pipefail

SUMMARY="${1:?用法：keep-tracking-translations.sh <summary.md>}"
BRANCH="${TRACK_BRANCH:-auto/track-versions}"
BASE="${BASE_BRANCH:-main}"

OPEN="$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number --jq '.[0].number // empty')"
if [ -z "$OPEN" ]; then
  echo "沒有開著的追蹤 PR，不搬譯文。"
  exit 0
fi
if ! git rev-parse --verify --quiet "refs/remotes/origin/$BRANCH" > /dev/null; then
  echo "找不到 origin/$BRANCH，不搬譯文。"
  exit 0
fi
npm run track:keep-branch -- --ref "origin/$BRANCH" --summary "$SUMMARY"
