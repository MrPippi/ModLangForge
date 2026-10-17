# 翻譯資料

每個模組一個資料夾 `mods/<modId>/`：

| 檔案 | 說明 |
|---|---|
| `mod.json` | 模組資訊、支援版本、翻譯狀態與授權（格式見 `packages/core/src/catalog/schema.ts`） |
| `en_us.json` | 英文原文快照，用來比對新增或變更的 key |
| `zh_tw.json` | 繁體中文譯文；每個 key 都必須存在於 `en_us.json` |
| `patchouli/<手冊>/en_us/**.json` | 選填。Patchouli 手冊的英文原樣檔（分類、條目），直接從 jar 的 `assets/<modId>/patchouli_books/` 複製，不要改動 |
| `patchouli_zh_tw.json` | 選填。手冊譯文，key 為 `<手冊>/<en_us 下的相對路徑>#<JSON 路徑>`；每個 key 都必須存在於原樣檔 |

## 整合包

每個整合包一個資料夾 `modpacks/<id>/`（`<id>` 規則同 modId）：

| 檔案 | 說明 |
|---|---|
| `modpack.json` | 整合包資訊、目前收錄的版本（`source`）、使用的模組（`mods`：平台、專案 ID、slug）與翻譯授權（格式見 `packages/core/src/modpack/schema.ts`）；由 `npm run add:modpack` 產生，名稱、簡介、作者需人工確認 |
| `kubejs/<命名空間>/en_us.json` | KubeJS 文字的英文原文，由 `add:modpack` 從整合包的 `overrides/kubejs/assets/<命名空間>/lang/en_us.json` 取得，不要手動改 |
| `kubejs/<命名空間>/zh_tw.json` | 選填。KubeJS 文字的繁中譯文；每個 key 都必須存在於同資料夾的 `en_us.json` |

`modpack.json` 不記錄 modId：網站建置時以 slug 對照各模組 `mod.json` 的 Modrinth／CurseForge 連結，之後新收錄的模組會自動對上。`modpacks/example-pack/` 是測試用的範例資料，不對應真實整合包。

提交前執行 `npm run validate:data` 檢查格式。授權見 [LICENSE](./LICENSE)。
