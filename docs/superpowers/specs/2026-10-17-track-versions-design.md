# 自動追蹤模組版本設計

## 問題

模組在 Modrinth 推出新版本或支援新的 Minecraft 版本後，新增的英文 key 只能靠人工記得執行 `npm run add:version` 才會進到資料，譯者也就不知道有新字串要翻。

## 決策

1. **每週自動開 PR**：排程 workflow 偵測並寫入所有更新，資料有變動時開（或更新）單一 PR；格式碼衝突的組合不寫入，列在 PR 說明。沒有變動就不開 PR。
2. **追蹤範圍＝所有組合**：已收錄組合的新版本，以及本站支援、可用 JSON 語言檔（`packFormat >= JSON_LANG_MIN_PACK_FORMAT`）的 MC 版本 × `LOADERS` 中、Modrinth 上有但尚未收錄的組合。
3. **每次執行上限**：預設最多成功寫入 100 個組合（`--max-builds`；嘗試次數上限為其 3 倍），超過的留到下次並寫入報告。先處理已收錄組合的更新，再處理新組合（MC 版本由新到舊，同版本依 `LOADERS` 順序）。
4. **先驗證再開 PR**：`GITHUB_TOKEN` 開的 PR 不會觸發其他 workflow，因此 workflow 自己先執行 `npm run validate:data`；失敗則該次執行失敗、不開 PR。設定 `TRACKER_TOKEN` secret 時改用它推送與開 PR，CI 即會照常觸發。

## 偵測規則

純函式 `packages/core/src/pipeline/trackPlan.ts`：

- 輸入：`CatalogMod`、該模組的 `ModrinthVersion[]`、上限。
- 適用模組：`format === 'json'` 且 `links.modrinth` 可解析出 slug；否則回傳「略過」與原因。
- 每個候選組合 `(mcVersion, loader)` 以既有的 `pickVersionFor(versions, mc, loader)` 取 Modrinth 上的最新版本：
  - **更新**：`sourceVersions` 已有此組合，且最新版本的 `version_number` 與記錄的 `modVersion` 不同（或未記錄 `modVersion`）。
  - **新增**：`sourceVersions` 沒有此組合，且 Modrinth 有對應版本。
  - 已是最新或 Modrinth 沒有對應版本 → 不列入。
- 輸出：依上述順序排列、截斷至上限的目標清單，以及被截斷的數量。

## 執行

- 從 `scripts/add-source-version.ts` 抽出共用模組 `scripts/lib/addVersion.ts`：下載 jar → 擷取該命名空間的 en_us → `planAddVersion` → 寫入 `mod.json`／`en_us.json`。`add:version` 改用它，行為不變。
- 新腳本 `scripts/track-versions.ts`（`npm run track:versions -- [--max-builds 100] [--summary <path>]`）：
  - 依序處理每個模組；同一模組的多個目標依序套用（每次重新讀取最新的 `mod.json`／`en_us.json`）。
  - 每個目標的結果為「已寫入（新增 N 個 key）」「衝突未寫入」「錯誤（訊息）」之一；單一失敗不影響其他目標。
  - 所有模組的上限合計計算（全域上限）。
  - 輸出 Markdown 摘要到 stdout，並在指定 `--summary` 時寫入檔案。腳本本身只在無法讀取資料目錄等致命錯誤時以非 0 結束。

## Workflow

`.github/workflows/track-versions.yml`：

- 觸發：`schedule`（每週一 02:00 UTC）、`workflow_dispatch`。
- 權限：`contents: write`、`pull-requests: write`；`concurrency` 防止重疊執行。
- 步驟：checkout → setup-node 24 → `npm ci` → `npm run track:versions -- --summary summary.md` → `npm run validate:data` → 若 `data/` 有變動：
  - 以 `github-actions[bot]` 身分 commit 到 `auto/track-versions`，強制推送（此分支只供自動化使用）。
  - 用 `gh` 查詢該分支是否已有開啟中的 PR：有則 `gh pr edit --body-file`，無則 `gh pr create`。
  - token：有 `TRACKER_TOKEN` 時使用，否則用 `GITHUB_TOKEN`，並在 PR 說明加註「CI 未自動執行，可關閉再重開 PR 觸發」。
- PR 標題：`chore(data): 追蹤模組新版本（YYYY-MM-DD）`；說明依 repo 的 PR 慣例以繁中撰寫，不附任何 session 連結。
- 需要維護者在 repo 設定開啟「Allow GitHub Actions to create and approve pull requests」。

## 測試

- core：`trackPlan`——已是最新、有新版本、未記錄版本號、新組合、MC 版本不支援或不足 JSON 門檻、`.lang` 模組、無 Modrinth 連結、上限與排序。
- 腳本共用模組：以注入的假 fetch／jar 讀取測試「寫入」「衝突」「錯誤」三種結果與摘要內容。
- workflow：以 `workflow_dispatch` 手動觸發一次驗證（需維護者操作）。

## 不在範圍

- 模組頁「翻譯來源版本」清單的摺疊顯示（清單可能變長，另案處理）。
- 自動修改 `translation.status`、自動合併 PR。
- 追蹤尚未收錄的新模組（`fetch:modrinth` 負責）。
