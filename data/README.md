# 翻譯資料

每個模組一個資料夾 `mods/<modId>/`：

| 檔案 | 說明 |
|---|---|
| `mod.json` | 模組資訊、支援版本、翻譯狀態與授權（格式見 `packages/core/src/catalog/schema.ts`） |
| `en_us.json` | 英文原文快照，用來比對新增或變更的 key |
| `zh_tw.json` | 繁體中文譯文；每個 key 都必須存在於 `en_us.json` |
| `patchouli/<手冊>/en_us/**.json` | 選填。Patchouli 手冊的英文原樣檔（分類、條目），直接從 jar 的 `assets/<modId>/patchouli_books/` 複製，不要改動 |
| `patchouli_zh_tw.json` | 選填。手冊譯文，key 為 `<手冊>/<en_us 下的相對路徑>#<JSON 路徑>`；每個 key 都必須存在於原樣檔 |

提交前執行 `npm run validate:data` 檢查格式。授權見 [LICENSE](./LICENSE)。
