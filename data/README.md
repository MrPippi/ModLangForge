# 翻譯資料

這個資料夾存放網站上所有模組的繁體中文翻譯。每個模組各有一個資料夾 `mods/<modId>/`（`<modId>` 是模組的 ID，例如 `create`），內含以下檔案：

| 檔案 | 說明 |
|---|---|
| `mod.json` | 模組資訊、支援的遊戲版本、翻譯狀態與授權（格式定義見 `packages/core/src/catalog/schema.ts`） |
| `en_us.json` | 英文原文的副本，用來比對模組更新時新增或變更了哪些條目（key） |
| `zh_tw.json` | 繁體中文譯文；其中每個 key 都必須在 `en_us.json` 中存在 |
| `patchouli/<手冊>/en_us/**.json` | 選用。Patchouli 遊戲內手冊的英文原始檔（分類與條目），直接從模組 jar 的 `assets/<modId>/patchouli_books/` 複製而來，請保持原樣 |
| `patchouli_zh_tw.json` | 選用。手冊的譯文，key 的格式為 `<手冊>/<en_us 下的相對路徑>#<JSON 路徑>`；其中每個 key 都必須在英文原始檔中存在 |

提交前請執行 `npm run validate:data` 檢查格式。授權說明請見 [LICENSE](./LICENSE)。
