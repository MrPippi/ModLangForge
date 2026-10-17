# 貢獻指南

感謝你願意參與 ModLangForge！無論是修正一個錯字、翻譯一整個模組，或改進網站程式，都非常歡迎。這份指南說明各種參與方式，以及提交內容時需要注意的地方。

## 修正既有譯文

### 在網站上建議修改（推薦，不需要會用 GitHub）

1. 在網站的模組頁，按想修改的譯文旁的「建議修改」；也可以用「搜尋這個模組的所有文字」找到那一句。
2. 填寫你建議的譯文並送出。沒有登入時，需要先通過一個簡單的人機驗證。
3. 維護者審核通過後，譯文會正式發佈，網站也會自動更新。

使用 Discord 或 GitHub 登入後送出的建議，會在「貢獻者」頁面為你署名。

### 透過 GitHub 提交 Pull Request（適合熟悉 Git 的貢獻者）

直接編輯 `data/mods/<modId>/zh_tw.json`（`<modId>` 是模組的 ID，例如 `create`），然後送出 Pull Request。CI（自動檢查）會確認格式是否正確，合併後網站會自動更新。

## 新增模組

1. 到網站的「自己翻譯」頁面翻譯模組，下載時選擇「分享給本站（投稿用）」。
2. 把下載的壓縮檔中的資料夾放進 `data/mods/`，並依照壓縮檔內 `README.txt` 的說明補齊 `mod.json`。
3. 執行 `npm run validate:data`，確認沒有錯誤後送出 Pull Request。

## 自動追蹤版本的 Pull Request

每週會自動出現一個標題為 `chore(data): 追蹤模組新版本` 的 Pull Request，內容是已收錄模組的新版本所新增的英文條目，以及新支援的版本組合。審核時請特別留意說明中的「衝突」與「錯誤」段落：有衝突的版本組合不會自動寫入，需要人工使用 `npm run add:version` 處理，或手動調整英文原文。

## 翻譯原則

- **保留所有格式碼**：格式碼是遊戲用來插入數值或改變文字顏色的特殊符號，例如 `%s`、`%d`、`%1$s`、`{0}`、`§a`。譯文中的格式碼數量必須與原文相同，順序可以依中文語序調整。
- **使用台灣慣用的譯名**，並讓同一個模組內的名詞保持一致。
- **只提交你自己翻譯，或確認授權相容的內容**（例如 CC BY、CC BY-SA），並在 `mod.json` 的 `translation.source` 註明出處。
- **機器翻譯的內容**，請將 `translation.status` 設為 `machine`。

## 術語表

術語表用來統一常見名詞的譯法，例如 Redstone 一律譯為「紅石」。

- **存放位置**：適用所有模組的術語放在 `data/glossary.json`；只適用某個模組的專有名詞放在 `data/mods/<modId>/glossary.json`（可不建立）。同一個英文詞兩邊都有定義時，以模組自己的術語表為準。
- **格式**：`{ "terms": [{ "en": "Redstone", "zh": "紅石" }] }`。可以加上 `"note"` 補充說明。設定 `"level": "error"` 時，違反這個術語會讓 CI 檢查失敗；預設的 `"warning"` 只會提出警告。
- **比對規則**：英文不分大小寫，並以完整單字比對，也會自動接受複數形（`s`／`es`）。譯文只要包含規定的譯名就算符合。
- **找出不一致的譯法**：`npm run glossary:mine` 會列出「同一個英文詞有不同譯法」的候選詞，以及現有術語被違反的次數，方便決定是否收錄。這個工具只會列出結果，不會修改資料。
- 在「自己翻譯」頁面翻譯時，每一行都會顯示符合的術語；譯文沒有使用規定譯名時會以黃色標示。

## Patchouli 手冊

Patchouli 是許多模組用來製作遊戲內說明書的工具。本站也支援翻譯這類手冊。

- **翻譯方式**：在「自己翻譯」頁面載入模組檔時，會一併讀出 `assets/<modId>/patchouli_books/<手冊>/en_us/` 中的手冊。把篩選列的「內容」切換到「手冊」即可翻譯；下載資源包時會一起產生繁體中文手冊。
- **資料存放位置**：`data/mods/<modId>/patchouli/<手冊>/en_us/**.json` 存放英文原始檔（請保持原樣，不要修改），`patchouli_zh_tw.json` 存放譯文。用「分享給本站（投稿用）」下載的壓縮檔已經是這個結構。
- **譯文的 key 格式**：`<手冊>/<en_us 下的相對路徑>#<JSON 路徑>`，例如 `guide/entries/basics/intro.json#pages/0/text`。只需要翻譯分類與條目的 `name`、`description`，以及每一頁的 `title`、`text`、`link_text`。
- **保留 Patchouli 格式碼**，例如 `$(item)`、`$(l:路徑)`、`$(br)`、`$()`、`$(#ff0000)`；不過 `$(t:提示)` 裡的提示文字可以翻譯。
- **目前不支援**：在 `book.json` 設定 `"i18n": true` 的手冊（這類手冊的文字已經放在一般語言檔中，照一般方式翻譯即可）、內容放在 `data/` 資料夾的舊式手冊，以及自訂模板（`templates/`）中的文字。

## 整合包

- 想要的整合包還沒收錄：到 GitHub 開 issue 提出需求，附上 Modrinth 或 CurseForge 頁面；新增整合包由維護者執行腳本。
- 翻譯整合包自己的文字（KubeJS）：在「自己翻譯」頁的「載入網站上的整合包」選擇整合包並載入，每個命名空間會變成一個項目；翻完後下載時選「分享給本站」，把壓縮檔裡的 `modpacks/<整合包>/kubejs/<命名空間>/zh_tw.json` 放到 `data/` 底下相同位置再送出 Pull Request。
- 翻譯 FTB 任務（Minecraft 1.21 以上的整合包）：同樣在「載入網站上的整合包」載入，任務會變成「<整合包名>（FTB 任務）」一個項目。多行的任務說明可以用 Shift＋Enter 換行，行數不必和英文一樣，但 `&a` 這類顏色碼和 `{@pagebreak}`（要單獨一行）等符號要保留。翻完後下載時選「分享給本站」，把壓縮檔裡的 `modpacks/<整合包>/ftbquests/zh_tw.json` 放到 `data/` 底下相同位置再送出 Pull Request。
- 維護者新增或更新：`npm run add:modpack -- --modrinth <slug|id>` 或 `npm run add:modpack -- --curseforge <slug|id>`（可加 `--version <版本>`）。CurseForge 需要 API 金鑰：複製 `.env.example` 為 `.env` 並填入 `CURSEFORGE_API_KEY`，或設定同名環境變數；腳本不會把金鑰寫入檔案或印出，也請不要貼到 issue、PR 或 commit。CurseForge 不允許第三方下載的整合包，請手動下載 zip 後加上 `--file <路徑>`。
- 更新時只改 `source`、`mods`、`ftbquests` 與 KubeJS／FTB 任務的英文（新 key 加入、原文不同的會列出、格式碼改變則整次不寫入），不動 `zh_tw.json`。Minecraft 1.21 以下的整合包不處理任務文字，只標記為 `unsupported-version`；任務檔讀取失敗時會說明是哪個檔案的第幾行，且不寫入任何檔案。
- CurseForge 整合包只會對上 `mod.json` 有填 `links.curseforge` 的模組。維護者可執行 `npm run backfill:curseforge`（先加 `--dry-run` 看結果）補上連結：只有 slug 或名稱確定是同一個模組時才寫入，無法確定的會列出候選，請人工確認後手動填入。設定了 CurseForge 金鑰時，`npm run fetch:modrinth` 新增模組也會一併寫入連結。金鑰只放在本機 `.env` 或環境變數，請勿貼到 issue、PR 或聊天中。
- 整合包裡還沒收錄的模組不會自動加入，仍需 `npm run fetch:modrinth` 或投稿。

## Pull Request 撰寫方式

- 請以繁體中文（台灣用語）撰寫說明，簡單說明改了哪些地方即可；程式碼名稱、指令與檔名請保留原文。
- 請依照 Pull Request 範本填寫「摘要」與「變更內容」，「備註」可視需要填寫。測試等檢查會由 CI 自動執行，不需要另外列出。
- Pull Request 的說明會公開顯示，請不要放入個人資料、存取權杖（token）或本機的檔案路徑。
- Commit 訊息請使用英文，並遵循 [Conventional Commits](https://www.conventionalcommits.org/) 格式，例如 `feat: add per-version coverage`。

## 資料格式

詳見 [data/README.md](./data/README.md) 與 `packages/core/src/catalog/schema.ts`。

## 授權

你提交的譯文會以 CC BY-SA 4.0 授權釋出，程式碼則以 MIT 授權釋出。送出貢獻即表示你同意以上授權方式。
