# 安全政策

感謝你協助讓 ModLangForge 更安全。如果你發現安全性漏洞，請依照以下方式私下告訴我們。

## 支援的版本

我們只維護正式站（https://modlangforge.com）與 `main` 分支上的最新程式碼，不會為舊版本另外提供修補。

## 如何回報漏洞

請使用 GitHub 的私密漏洞回報功能：[回報安全性漏洞](https://github.com/MrPippi/ModLangForge/security/advisories/new)（也可以從 repo 的 Security 頁面點選「Report a vulnerability」）。

為了保護其他使用者，**請不要**在公開的 issue、Pull Request 或討論區透露漏洞細節。

## 回報範圍

以下項目屬於回報範圍：

- 網站後端 API（`/api/v1/*`）
- Discord／GitHub 登入（OAuth）與登入狀態的管理
- 管理與審核功能（`/admin/` 及相關 API）
- 譯文發佈流程（透過 GitHub App 將審核通過的譯文寫入 repo）

以下項目不在範圍內：需要實際接觸使用者裝置的攻擊、單純的社交工程、Cloudflare、GitHub、Discord 等第三方服務本身的問題，以及沒有實際驗證的自動化掃描結果。

## 回報時請提供

- 受影響的網址或 API，以及漏洞類型
- 重現步驟或概念驗證（PoC，Proof of Concept）
- 預期的行為、實際的行為，以及可能造成的影響
- 相關的紀錄或截圖（請先移除個人資料與金鑰）

## 處理方式

本專案由志願者在業餘時間維護，無法承諾固定的回應時間，但我們會儘快確認你的回報、完成修補，並在公開說明前先通知你。如果你希望在修補說明中具名致謝，請在回報時告訴我們。
