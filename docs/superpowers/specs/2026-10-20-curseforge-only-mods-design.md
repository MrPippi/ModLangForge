# 只在 CurseForge 上架的模組設計

## 背景

本站收錄、追蹤與展示模組的流程原本都以 Modrinth 為準：收錄靠 `npm run fetch:modrinth`，版本追蹤靠 `links.modrinth`，圖示、橫幅與下載量也只從 Modrinth 取得。但 CurseForge 下載量排名前段有不少模組只在 CurseForge 上架，例如 Applied Energistics 2、FTB 系列、The Twilight Forest、MineColonies、Ender IO、Storage Drawers。2026-10-19 試跑時，照 CurseForge 排名湊出的前 100 個新模組中，就有 25 個屬於這種情況。

這份設計讓這類模組和 Modrinth 模組一樣完整：可以收錄、每週會自動追蹤新版本、通過資料檢查，網站上也有圖示、橫幅和下載量。

## 目標

1. 收錄：新增 `npm run fetch:curseforge`，照 CurseForge 總下載量排名收錄模組。CurseForge 專有模組直接從 CurseForge 下載 jar；Modrinth 上也有的模組，則沿用 Modrinth 流程（同時寫入兩個連結）。
2. 新增版本：`npm run add:version` 支援只有 CurseForge 連結的模組。
3. 版本追蹤：`npm run track:versions` 與每週 workflow 會追蹤 CurseForge 專有模組。
4. 資料格式：內建繁中條目可以只有 CurseForge 連結。
5. 網站展示：CurseForge 專有模組有圖示、橫幅與下載量；內建繁中頁的下載按鈕指向 CurseForge。

## 不做的事

- 同時在兩個平台上架的模組，一律以 Modrinth 為準（追蹤、圖示、橫幅、下載量都不變），不合併兩邊的下載量。
- 不改 `sourceVersions` 的資料格式，也不記錄來源平台：同一個模組固定只用一個平台追蹤（見「平台選擇」），所以不需要。
- 不處理投稿流程在 `apps/site/src/translator/ui/contribution.ts` 自動產生的 Modrinth 連結。
- 這份設計不包含「翻譯 100 個模組」本身；那是做完這份設計之後的下一個工作。

## 絕對不能發生的事

- **不繞過作者的下載限制。** CurseForge API 回傳的 `downloadUrl` 是 `null`，代表作者不允許第三方下載。這時不得自行組出 CDN 網址，也不得改用其他來源下載；該模組或該版本一律略過，並在輸出中列出原因。
- **金鑰不外洩。** CurseForge 金鑰只送往 `https://api.curseforge.com`（沿用 `apiInit`：`x-api-key` 與 `redirect: 'error'`），下載 CDN 檔案時不帶金鑰；任何錯誤訊息都先用 `redact` 遮蔽金鑰。
- **沒有金鑰時不壞掉。** 所有腳本與 workflow 在沒有 `CURSEFORGE_API_KEY` 時，照常處理 Modrinth 模組，CurseForge 專有模組則列為「略過：沒有 CurseForge 金鑰」，不以錯誤結束。
- **既有 Modrinth 模組的行為不變。** 現有 81 個模組與 17 個內建條目的追蹤結果、圖示、橫幅與下載量都不能改變。

## 平台選擇

純函式 `trackingPlatform(links)`：`links.modrinth` 能解析出 slug 時回傳 `modrinth`；否則 `links.curseforge` 符合 `CURSEFORGE_MOD_URL`（`packages/core/src/modpack/resolve.ts`）時回傳 `curseforge`；兩者都沒有則回傳 `null`。追蹤、新增版本、圖示、橫幅、下載量都用這個函式決定資料來源。

## 平台中立的版本型別

目前 `trackPlan.ts`、`applyVersion.ts`、`scripts/lib/addVersion.ts` 都直接使用 `ModrinthVersion`。新增中立型別（放在 `packages/core/src/pipeline/`）：

```ts
interface PlatformBuild {
  readonly platform: 'modrinth' | 'curseforge';
  readonly id: string;              // Modrinth 版本 ID，或 CurseForge 檔案 ID（數字轉字串）
  readonly modVersion: string;      // 寫入 sourceVersions.modVersion 的文字
  readonly mcVersions: readonly string[];
  readonly loaders: readonly Loader[];
  readonly publishedAt: string;     // ISO 時間
  readonly file: { readonly name: string; readonly url: string | null };  // url 為 null＝不允許第三方下載
}
```

- Modrinth 轉換：`modVersion = version_number`、`mcVersions = game_versions`、`loaders = loaders`（只保留 `LOADERS` 內的值）、`publishedAt = date_published`、`file = primaryFile`。轉換後 `pickVersionFor`、`resolveSourceRef`、`planTracking`、`applyVersion` 的結果必須與現在完全相同，既有測試要照常通過。
- CurseForge 轉換：
  - `modVersion` 為檔名去掉結尾的 `.jar`（例如 `appliedenergistics2-19.2.17`）。顯示名稱是作者自由填寫的文字，常帶括號和平台名稱，所以不用。
  - `gameVersions` 中符合 MC 版本格式的值放進 `mcVersions`，`NeoForge`／`Forge`／`Fabric`／`Quilt` 轉成小寫放進 `loaders`，其餘（`Client`、`Server`、`Java 21` 等）忽略。
  - 略過伺服器包（`isServerPack`）、不是 `.jar` 的檔案，以及 `isAvailable === false` 或 `fileStatus` 不是已核准狀態（4）的檔案。
  - 需要擴充 `modpackImport/curseforge.ts` 的 `filesSchema`，加入 `gameVersions`、`isAvailable`、`fileStatus`（皆以 zod 驗證；舊欄位不變，整合包匯入的行為不變）。
- 版本挑選規則（最新、Quilt 有 Fabric 時略過等）只寫一份，兩個平台共用。
- jar 擷取的快取鍵改成 `<platform>:<id>:<modId>`，避免兩個平台的 ID 撞在一起。

## 收錄：`fetch:curseforge`

`npm run fetch:curseforge -- --limit 100 [--scan 3000] [--dry-run]`：

1. 以 `/mods/search?gameId=432&classId=6&sortField=6&sortOrder=desc`（總下載量）分頁取得排名，每頁 50 筆，最多掃到 `--scan` 名。
2. 已收錄的模組跳過：CurseForge slug 已出現在任何 `mod.json`／內建條目的 `links.curseforge`，或 jar 讀出的 modId 已存在。
3. 尋找 Modrinth 對應專案，依下列順序分流：
   - 以 CurseForge slug 查 `GET /v2/project/<slug>`。slug 相同且作者有重疊（沿用 `curseforgeLinks` 的比對規則）：走 Modrinth 流程。
   - 查不到該 slug 時，再用模組名稱做一次 Modrinth 搜尋：名稱（正規化後）相同且作者有重疊，走 Modrinth 流程。
   - 其他只是「可能」同一個模組的情形（例如 slug 存在但作者不重疊、名稱相同但作者不重疊）：略過，輸出「Modrinth 上可能有同一個模組，需人工確認（<slug>）」，不當成 CurseForge 專有模組收錄。
   - 什麼都找不到：視為 CurseForge 專有模組。
   - 走 Modrinth 流程時，照 `fetch:modrinth` 的 `processHit` 流程收錄，CurseForge 連結直接寫入（不需要再搜尋）。請把 `processHit` 抽成共用函式，兩個腳本共用。
   - CurseForge 專有模組：從 CurseForge 下載 jar 收錄。版本照慣例先找 1.21.1、再找 1.20.1（`PREFERRED_MC_VERSIONS`），同版本取最新的檔案。
4. 判斷規則與 `fetch:modrinth` 完全相同（`selectForTranslation`）：內建繁中涵蓋全部 key 就建內建條目；少於 20 個 key 或超過 1500 個 key 就略過；其餘收錄。
5. `--limit` 計算新收錄的模組（含內建條目）。`--dry-run` 只輸出判斷結果，不寫入任何檔案。
6. 每一名都輸出一行結果（新增、內建、略過與原因、錯誤），最後輸出合計。單一模組失敗不影響其他模組。
7. 沒有金鑰時，以清楚的訊息結束（這個指令本身需要 CurseForge 排名）。

CurseForge 專有模組的草稿 `mod.json`：

- `links`：只有 `curseforge`，用 `curseforgeModUrl(slug)`。
- `name`：CurseForge 名稱；`aliases`：`[slug]`；`authors`：CurseForge 作者名稱。
- `mcVersions`、`loaders`：從 CurseForge 檔案清單中，本站支援的 MC 版本與載入器整理而來。
- 其他欄位（`summary` 佔位文字、翻譯授權、`sourceVersions` 等）與 Modrinth 草稿相同。請把 `buildDraftMeta`／`buildBuiltinMeta` 改成接受平台中立的輸入，Modrinth 的輸出要和現在一樣。

## 新增版本與版本追蹤

- `add-source-version.ts`：依 `trackingPlatform` 取得版本清單。CurseForge 模組需要金鑰，沒有金鑰時以清楚的錯誤訊息結束。
- `trackPlan.ts`：輸入改成 `PlatformBuild[]`。只有 `trackingPlatform` 為 `null` 時，才回傳「略過：沒有 Modrinth 或 CurseForge 連結」。
- `track-versions.ts`：CurseForge 模組以 `/mods/<id>/files` 分頁取得檔案（專案 ID 用 slug 搜尋一次取得）。沒有金鑰時略過，原因寫進摘要。挑到的檔案若 `file.url` 為 `null`，該目標記為「略過：作者不允許第三方下載」，不算錯誤。
- `.github/workflows/track-versions.yml`：在 Track 與 Refresh 步驟加入 `CURSEFORGE_API_KEY: ${{ secrets.CURSEFORGE_API_KEY }}`，寫法比照 `track-modpacks.yml`。

## 資料格式與檢查

- `builtinSchema.ts`：`links` 改成必須有 `modrinth` 或 `curseforge` 其中一個，錯誤訊息改為「內建條目必須提供 Modrinth 或 CurseForge 連結」。
- `links.curseforge` 只有在符合 `CURSEFORGE_MOD_URL` 時，才算 CurseForge 專有模組的有效連結。`validate:data` 對「沒有 `links.modrinth`、但有不符格式的 `links.curseforge`」的模組報錯，避免追蹤與整合包比對靜默失效。

## 網站展示

### 圖示與橫幅

- `fetch-mod-icons.ts`：Modrinth 模組不變；CurseForge 專有模組改用 `/mods/<id>` 的 `logo.url`（沒有時改用 `logo.thumbnailUrl`）。
- `fetch-mod-banners.ts`：CurseForge 專有模組從 `screenshots` 挑圖，依原本順序取第一張，並沿用 `banners-disabled.json` 與既有的尺寸處理。
- 只接受 CurseForge 圖片 CDN（`https://media.forgecdn.net/`）的網址，下載時 `redirect: 'error'`，不帶金鑰。
- 輸出位置、格式與尺寸不變（`apps/site/public/mod-icons/`、`mod-banners/`）。沒有金鑰時略過 CurseForge 模組。

### 下載量

- `data/modrinth-stats.json` 改名為 `data/mod-stats.json`，每筆加上 `platform`（`modrinth` | `curseforge`），格式升為 `version: 2`。`mergeModStats` 改成保留所有 `trackingPlatform` 不為 `null` 的模組。這次直接轉換既有檔案，所有既有條目都是 `modrinth`。
- `fetch-mod-stats.ts`：依 `trackingPlatform` 取 Modrinth `downloads` 或 CurseForge `downloadCount`。
- 下載量排序照常混合比較：使用者已同意 CurseForge 專有模組因數字較大而排到前面。
- 下載量的標籤依平台顯示「Modrinth 下載量」或「CurseForge 下載量」（`i18n/zh-TW.ts` 的 `modPage.downloads` 改成依平台選字）。卡片與列表上的數字也要能分辨平台（例如在數字旁顯示平台名稱），細節交給實作者，維持現有版面，不要大改。

### 內建繁中頁

`BuiltinModPage.astro` 的下載按鈕：有 Modrinth 連結就照舊；否則連到 CurseForge，文字改為「到 CurseForge 下載模組」。

## 文件

更新 `data/README.md`、`CONTRIBUTING.md`、`docs/development.md`：說明 `fetch:curseforge`、CurseForge 專有模組的處理方式、哪些指令需要金鑰，以及作者不允許第三方下載的模組會被略過。

## 測試

- 依專案慣例先寫測試。所有 CurseForge 請求都用既有的 `fakeFetch` 測試替身，不連真的 API。
- 必測：兩種平台轉換、`trackingPlatform`、`planTracking` 的 CurseForge 情境（含不允許下載）、`builtinSchema` 的新規則、`mod-stats.json` v2 的讀寫與轉換、`fetch:curseforge` 的分流邏輯（以純函式測試）、內建繁中頁的 CurseForge 按鈕（e2e）。
- 既有測試全部要照常通過；`npm run validate:data`、`npm run lint`、`npm test`、`npm run test:e2e` 都要通過。

## 補充規則

以下是設計者在審閱後補上的決定：

1. **測試版也算。** Modrinth 的 `pickVersionFor` 不區分正式版與測試版，CurseForge 也一樣：`releaseType` 為 alpha／beta 的檔案照常列入，兩邊行為一致。
2. **兩邊都有、但 Modrinth 沒有可用版本時直接略過。** 如果 `fetch:curseforge` 找到了 Modrinth 對應專案，但它沒有 1.21.1／1.20.1 版本或可用的 jar，就略過這個模組，不改從 CurseForge 下載，以維持「有 Modrinth 連結就以 Modrinth 為準」。
3. **平台切換不特別處理。** CurseForge 專有模組之後若補上 Modrinth 連結，下次追蹤時 `modVersion` 文字會和記錄的不同，各組合會被當成「更新」重新擷取一次。結果正確，只是多一次寫入，可以接受，不另外處理。
4. **CurseForge jar 下載的限制：**
   - 只接受 `https://edge.forgecdn.net/` 與 `https://mediafilez.forgecdn.net/` 的網址，其他網址視為錯誤。
   - 下載 jar 時最多跟隨 3 次轉址，而且只能在上述兩個網域之間轉址（`edge.forgecdn.net` 一律會 302 轉到 `mediafilez.forgecdn.net`）；轉到其他網址視為錯誤。下載不帶金鑰。呼叫 `api.curseforge.com` 的 API 仍然 `redirect: 'error'`，不跟隨任何轉址。
   - 大小上限沿用 `MAX_JAR_BYTES`。
   - 檔案資料有 sha1（`hashes` 中 `algo === 1`）時要比對，不符就視為錯誤。需要把 `hashes` 加進 `filesSchema`。
5. **支援的 MC 版本與載入器沿用既有清單。** MC 版本只用 `PACK_FORMATS` 中、可用 JSON 語言檔的版本，載入器用 `LOADERS`，篩選方式和 Modrinth 草稿（`sharedMeta`）相同。一個檔案在 `gameVersions` 標示多個載入器時，每個都算；選擇來源版本時也沿用 `resolveSourceRef` 的載入器優先順序。不要另外建一份清單。
6. **沒有金鑰時保留舊資料。** 這時 `fetch-mod-stats`、圖示與橫幅腳本都不刪除 CurseForge 專有模組的既有下載量、圖示或橫幅；`mergeModStats` 要保留這些既有條目。
7. **請求量。** 每週追蹤時，每個 CurseForge 專有模組都用 slug 搜尋一次專案 ID，再分頁取得檔案清單，依序執行即可，不需要另外做快取或存檔。
8. **下載量檔案直接改名。** `data/modrinth-stats.json` 只有本 repo 的網站建置、`validate:data`、`fetch-mod-stats.ts` 與文件會用到（workflow 用 `git add data` 提交整個資料夾），所以直接改名，不需要相容步驟。

## 交給實作者決定

- 檔案與函式的確切命名、怎麼拆分模組。
- CurseForge 檔案清單的分頁與快取做法。
- 卡片上平台標示的具體呈現方式（要小、要清楚、不要改動版面）。
