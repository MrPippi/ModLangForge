# 貢獻指南

## 修正既有譯文

**站內建議（網站已啟用建議功能時）**

1. 在網站的模組頁按該條目旁的「建議修改」（或「搜尋本模組所有條目」找到條目）。
2. 填寫建議譯文、完成人機驗證後送出。
3. 維護者審核通過後會發布，網站自動更新。

**GitHub 編輯／Pull Request（尚未啟用站內建議時，或你是開發者）**

在模組頁按「在 GitHub 修正譯文」，或直接編輯 `data/mods/<modId>/zh_tw.json` 並送出 Pull Request，CI 會自動檢查格式；合併後網站自動更新。

## 新增模組

1. 到網站的「上傳 jar 翻譯」頁面翻譯模組，匯出時選「貢獻檔」。
2. 把壓縮檔內的資料夾放到 `data/mods/`，依 `README.txt` 補齊 `mod.json`。
3. 執行 `npm run validate:data`，確認沒有錯誤後送出 Pull Request。

## 翻譯原則

- 保留所有格式碼：`%s`、`%d`、`%1$s`、`{0}`、`§a` 等，數量必須與原文相同（順序可依中文語序調整）。
- 使用台灣慣用譯名；同一模組內名詞保持一致。
- 只有自己翻譯或確認授權相容（如 CC BY、CC BY-SA）的內容才能提交，並在 `mod.json` 的 `translation.source` 標示出處。
- 機器翻譯的內容請將 `translation.status` 設為 `machine`。

## 資料格式

見 [data/README.md](./data/README.md) 與 `packages/core/src/catalog/schema.ts`。

## 授權

提交的譯文以 CC BY-SA 4.0 授權釋出；程式碼以 MIT 授權釋出。
