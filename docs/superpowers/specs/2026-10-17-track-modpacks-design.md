# 整合包每週自動追蹤設計

## 問題

每週追蹤（#3，`.github/workflows/track-versions.yml`）只追蹤模組。整合包推出新版本後，`data/modpacks/<id>/` 的 `source`、`mods`、KubeJS 與 FTB 任務英文不會更新，網站上的整合包頁與一鍵下載會停在舊版。

## 決策

1. 新增腳本 `npm run track:modpacks`：逐一檢查已收錄的整合包是否有新版本，有就沿用 `add:modpack` 的更新流程（`runAddModpack`，不指定版本＝最新版）寫入。
2. 新增 workflow `.github/workflows/track-modpacks.yml`：每週一 03:00 UTC 執行（模組追蹤的一小時後），也可手動觸發；結果以單一 PR 送出，分支 `auto/track-modpacks`。
3. `scripts/ci/open-tracking-pr.sh` 改為可參數化分支與標題（模組追蹤沿用原本的值，行為不變）。
4. CurseForge 整合包需要 secret `CURSEFORGE_API_KEY`；未設定時略過 CurseForge 整合包並在摘要中註明，不失敗。
5. 範例整合包（id 以 `example-` 開頭）不追蹤。

## 檢查流程（每個整合包）

1. 讀 `modpack.json`（zod 驗證）；id 以 `example-` 開頭 → 略過（「範例資料」）。
2. 取得平台上的最新版本：
   - Modrinth：`GET /v2/project/<projectId>/version`，取 `date_published` 最新者的 `version_number`。
   - CurseForge：沿用 4b 的檔案清單（分頁讀完），取最新非伺服器檔；比對方式與 `add:modpack` 選檔一致。
3. 最新版本與 `source.version` 相同 → 「已是最新」。
4. 不同 → 呼叫 `runAddModpack`（不帶 `--version`）：
   - `written` → 記錄新版本、新增 key 數、原文不同的條目、提示（例如 Minecraft 版本不支援的任務文字）。
   - `conflict`（格式碼改變）→ 不寫入，列為「需要人工處理」。
   - `error`（例如 Minecraft 版本不在版本表、CurseForge 不允許第三方下載）→ 不寫入，列為「需要人工處理」並附訊息（金鑰已遮蔽）。
5. 單一整合包失敗不影響其他整合包；整合包數量少，不設寫入上限，但依序處理。

## 摘要（PR 內文，台灣繁中）

- 已更新：整合包名稱、舊版本 → 新版本、Minecraft 版本、模組數變化、KubeJS／FTB 任務新增的 key 數。
- 需要人工處理：原因與訊息。
- 略過：已是最新、範例資料、缺少 CurseForge 金鑰。
- 沒有任何變動時不開 PR（沿用 `open-tracking-pr.sh` 的判斷）。

## Workflow

- 觸發：`schedule: cron '0 3 * * 1'`、`workflow_dispatch`。
- 權限：`contents: write`、`pull-requests: write`；concurrency group `track-modpacks`。
- 步驟：checkout（`persist-credentials: false`）→ setup-node 24 → `npm ci` → `npm run track:modpacks -- --summary "$RUNNER_TEMP/summary.md"`（env `CURSEFORGE_API_KEY: ${{ secrets.CURSEFORGE_API_KEY }}`）→ 摘要寫入 `$GITHUB_STEP_SUMMARY` → `npm run validate:data` → `open-tracking-pr.sh`（分支 `auto/track-modpacks`、標題 `chore(data): 追蹤整合包新版本（<UTC 日期>）`）。
- 金鑰只以環境變數傳給腳本；不寫入檔案、不出現在摘要或 log（沿用 `redact`）。

## 測試

- core：最新版本判斷（Modrinth／CurseForge）、已是最新略過、範例略過、無金鑰略過 CurseForge、written／conflict／error 的處理、單一失敗不影響其他、摘要內容。全部以注入的假 fetch 與假金鑰測試。
- 腳本：參數解析（`--summary`）、無變動時的輸出。
- `open-tracking-pr.sh`：模組追蹤呼叫方式不變（預設分支與標題）。

## 文件

- `docs/development.md`：新增 `track:modpacks` 與 workflow 說明、`CURSEFORGE_API_KEY` secret 設定方式（不要把金鑰貼到 issue、PR 或聊天）。

## 不在範圍

- 自動收錄新的整合包。
- 整合包更新時自動補收錄新出現的模組。
- 舊版本的保留（`data/modpacks` 只記錄目前收錄的版本，沿用 4b）。
