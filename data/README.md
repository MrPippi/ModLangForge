# 翻譯資料

這個資料夾存放網站上所有模組的繁體中文翻譯。每個模組各有一個資料夾 `mods/<modId>/`（`<modId>` 是模組的 ID，例如 `create`），內含以下檔案：

| 檔案 | 說明 |
|---|---|
| `mod.json` | 模組資訊、支援的遊戲版本、翻譯狀態與授權（格式定義見 `packages/core/src/catalog/schema.ts`） |
| `en_us.json` | 英文原文的副本，用來比對模組更新時新增或變更了哪些條目（key） |
| `zh_tw.json` | 繁體中文譯文；其中每個 key 都必須在 `en_us.json` 中存在 |
| `patchouli/<手冊>/en_us/**.json` | 選用。Patchouli 遊戲內手冊的英文原始檔（分類與條目），直接從模組 jar 的 `assets/<modId>/patchouli_books/` 複製而來，請保持原樣 |
| `patchouli_zh_tw.json` | 選用。手冊的譯文，key 的格式為 `<手冊>/<en_us 下的相對路徑>#<JSON 路徑>`；其中每個 key 都必須在英文原始檔中存在 |

## 模組來自哪個平台

模組的 `mod.json`（或內建繁中模組的資訊檔）裡，`links` 至少要有 `modrinth` 或 `curseforge` 其中一個連結。

- 只在 CurseForge 上架的模組，`links` 只放 `curseforge`（格式為 `https://www.curseforge.com/minecraft/mc-mods/<slug>`），沒有 Modrinth 連結。這類模組一樣會被每週自動追蹤新版本，也會有圖示、橫幅與下載量。
- 同時在兩個平台上架的模組，一律以 Modrinth 為準：追蹤、圖示、橫幅與下載量都取自 Modrinth，CurseForge 連結只是方便玩家前往。
- 沒有 Modrinth 連結、而 `links.curseforge` 又不符合上述格式時，`npm run validate:data` 會報錯，避免追蹤與整合包比對悄悄失效。
- 作者在 CurseForge 上不允許第三方下載的模組或版本，本站不會下載，也不會改用其他來源；維護者執行腳本時會看到「作者不允許第三方下載」的略過說明。

## 下載量紀錄

`data/mod-stats.json` 記錄各模組的下載量，由 `npm run stats:fetch` 更新，每週自動更新一次。檔案格式如下，每個模組一筆：

```json
{
  "version": 2,
  "mods": {
    "alexsmobs": { "downloads": 15693802, "platform": "modrinth", "fetchedAt": "2026-10-19" }
  }
}
```

`platform` 是下載量的來源（`modrinth` 或 `curseforge`），網站會依它顯示「Modrinth 下載量」或「CurseForge 下載量」。兩個平台的數字計算方式不同，網站上的排序仍會把它們放在一起比較。沒有 CurseForge 金鑰時，只會更新 Modrinth 模組，CurseForge 模組原有的下載量會保留。

## 更新日誌

網站的「更新日誌」頁讀取 `changelog/` 下的兩個檔案：

- `changelog/site.json`：網站功能的更新，手動撰寫。每一筆是 `{ "date": "YYYY-MM-DD", "title": "標題", "items": ["說明"] }`，放在 `entries` 陣列裡，新的寫在前面。請用玩家看得懂的說法。
- `changelog/translations.json`：每天新收錄、譯文有更新、支援新 Minecraft 版本的模組，由 `npm run changelog:build` 從 git 紀錄產生，不要手動修改。

## 內建繁中模組

有些模組的 jar 檔本身就附有完整的繁體中文（`zh_tw.json` 涵蓋所有英文條目）。這類模組不需要本站的資源包，所以只放一個輕量的資訊檔 `builtin-mods/<modId>.json`，不放 `en_us.json`、`zh_tw.json`，網站上會標示為「內建繁中」，並提示玩家在遊戲內切換語言即可。

| 欄位 | 說明 |
|---|---|
| `modId`、`name`、`aliases`、`summary`、`authors`、`links` | 模組基本資訊；`name` 只填英文名稱，中文叫法放在 `aliases` |
| `mcVersions`、`loaders` | 支援的遊戲版本與模組載入器 |
| `checkedVersion` | 檢查「已有完整繁中」時用的模組版本、遊戲版本與載入器，之後可用同樣的版本重新檢查 |
| `updatedAt` | 最後確認的日期 |

（格式定義見 `packages/core/src/catalog/builtinSchema.ts`。）

- **何時建立**：執行 `npm run fetch:modrinth` 或 `npm run fetch:curseforge` 時，如果模組 jar 內的 `zh_tw.json` 已涵蓋所有英文 key，就會建立這個檔案，而不是一般的 `mods/<modId>/`。只要缺少任何 key，就照一般模組收錄未涵蓋的部分。
- **為什麼不放譯文**：譯文是原作者的作品，這類模組已經內建，本站不需要也不複製一份；也避免日後與模組自己的翻譯不一致。
- 同一個 modId 不能同時存在於 `mods/` 與 `builtin-mods/`，`npm run validate:data` 會檢查。

## 整合包

每個整合包一個資料夾 `modpacks/<id>/`（`<id>` 規則同 modId）：

| 檔案 | 說明 |
|---|---|
| `modpack.json` | 整合包資訊、目前收錄的版本（`source`）、使用的模組（`mods`：平台、專案 ID、slug）與翻譯授權（格式見 `packages/core/src/modpack/schema.ts`）；由 `npm run add:modpack` 產生，名稱、簡介、作者需人工確認 |
| `kubejs/<命名空間>/en_us.json` | KubeJS 文字的英文原文，由 `add:modpack` 從整合包的 `overrides/kubejs/assets/<命名空間>/lang/en_us.json` 取得，不要手動改 |
| `kubejs/<命名空間>/zh_tw.json` | 選填。KubeJS 文字的繁中譯文；每個 key 都必須存在於同資料夾的 `en_us.json` |
| `ftbquests/en_us.json` | 選填。FTB 任務（任務書、章節群組、章節、任務的標題、副標與說明）的英文原文，由 `add:modpack` 從整合包的 `overrides/config/ftbquests/quests/` 取得，不要手動改；key 為 `<類型>.<16 位十六進位 ID>.<欄位>`，多行的說明以 `\n` 分行 |
| `ftbquests/zh_tw.json` | 選填。FTB 任務的繁中譯文；每個 key 都必須存在於 `en_us.json`；行數可以和英文不同，但 `&a` 這類顏色碼、`{@pagebreak}`（要單獨一行）等符號要保留 |

`modpack.json` 不記錄 modId：網站建置時以 slug 對照各模組 `mod.json` 的 Modrinth／CurseForge 連結，之後新收錄的模組會自動對上。注意：CurseForge 整合包只會對上有填 `links.curseforge` 的模組，而目前大多數已收錄的模組只有 Modrinth 連結，所以 CurseForge 整合包頁面可能把它們標成「尚未收錄」，補上連結後才會對上。`modpacks/example-pack/`（Minecraft 1.20.1）與 `modpacks/example-quests/`（Minecraft 1.21.1，含 FTB 任務）是測試用的範例資料，不對應真實整合包。

FTB 任務只支援 Minecraft 1.21 以上的整合包：`modpack.json` 的 `ftbquests` 寫成 `{ "status": "supported", "layout": "single" }`（`layout` 為 `single`＝`lang/<語言>.snbt`、`split`＝`lang/<語言>/` 資料夾）；1.21 以下但有任務檔的整合包寫成 `{ "status": "unsupported-version" }`，而且不能有 `ftbquests/` 資料夾；沒有任務檔時不寫這個欄位。任務翻譯不能放進資源包，網站另外提供一個 `.snbt` 任務檔下載，玩家要放到整合包的 `config/ftbquests/quests/lang/` 底下。

提交前請執行 `npm run validate:data` 檢查格式。授權說明請見 [LICENSE](./LICENSE)。
