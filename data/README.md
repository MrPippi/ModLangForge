# 翻譯資料

這個資料夾存放網站上所有模組的繁體中文翻譯。每個模組各有一個資料夾 `mods/<modId>/`（`<modId>` 是模組的 ID，例如 `create`），內含以下檔案：

| 檔案 | 說明 |
|---|---|
| `mod.json` | 模組資訊、支援的遊戲版本、翻譯狀態與授權（格式定義見 `packages/core/src/catalog/schema.ts`） |
| `en_us.json` | 英文原文的副本，用來比對模組更新時新增或變更了哪些條目（key） |
| `zh_tw.json` | 繁體中文譯文；其中每個 key 都必須在 `en_us.json` 中存在 |
| `patchouli/<手冊>/en_us/**.json` | 選用。Patchouli 遊戲內手冊的英文原始檔（分類與條目），直接從模組 jar 的 `assets/<modId>/patchouli_books/` 複製而來，請保持原樣 |
| `patchouli_zh_tw.json` | 選用。手冊的譯文，key 的格式為 `<手冊>/<en_us 下的相對路徑>#<JSON 路徑>`；其中每個 key 都必須在英文原始檔中存在 |

## 整合包

每個整合包一個資料夾 `modpacks/<id>/`（`<id>` 規則同 modId）：

| 檔案 | 說明 |
|---|---|
| `modpack.json` | 整合包資訊、目前收錄的版本（`source`）、使用的模組（`mods`：平台、專案 ID、slug）與翻譯授權（格式見 `packages/core/src/modpack/schema.ts`）；由 `npm run add:modpack` 產生，名稱、簡介、作者需人工確認 |
| `kubejs/<命名空間>/en_us.json` | KubeJS 文字的英文原文，由 `add:modpack` 從整合包的 `overrides/kubejs/assets/<命名空間>/lang/en_us.json` 取得，不要手動改 |
| `kubejs/<命名空間>/zh_tw.json` | 選填。KubeJS 文字的繁中譯文；每個 key 都必須存在於同資料夾的 `en_us.json` |
| `ftbquests/en_us.json` | 選填。FTB 任務（任務書、章節群組、章節、任務的標題、副標與說明）的英文原文，由 `add:modpack` 從整合包的 `overrides/config/ftbquests/quests/` 取得，不要手動改；key 為 `<類型>.<16 位十六進位 ID>.<欄位>`，多行的說明以 `
` 分行 |
| `ftbquests/zh_tw.json` | 選填。FTB 任務的繁中譯文；每個 key 都必須存在於 `en_us.json`；行數可以和英文不同，但 `&a` 這類顏色碼、`{@pagebreak}`（要單獨一行）等符號要保留 |

`modpack.json` 不記錄 modId：網站建置時以 slug 對照各模組 `mod.json` 的 Modrinth／CurseForge 連結，之後新收錄的模組會自動對上。注意：CurseForge 整合包只會對上有填 `links.curseforge` 的模組，而目前大多數已收錄的模組只有 Modrinth 連結，所以 CurseForge 整合包頁面可能把它們標成「尚未收錄」，補上連結後才會對上。`modpacks/example-pack/`（Minecraft 1.20.1）與 `modpacks/example-quests/`（Minecraft 1.21.1，含 FTB 任務）是測試用的範例資料，不對應真實整合包。

FTB 任務只支援 Minecraft 1.21 以上的整合包：`modpack.json` 的 `ftbquests` 寫成 `{ "status": "supported", "layout": "single" }`（`layout` 為 `single`＝`lang/<語言>.snbt`、`split`＝`lang/<語言>/` 資料夾）；1.21 以下但有任務檔的整合包寫成 `{ "status": "unsupported-version" }`，而且不能有 `ftbquests/` 資料夾；沒有任務檔時不寫這個欄位。任務翻譯不能放進資源包，網站下載時會放在 `config/ftbquests/quests/lang/` 底下。

提交前請執行 `npm run validate:data` 檢查格式。授權說明請見 [LICENSE](./LICENSE)。
