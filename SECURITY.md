# 安全政策

## 支援範圍

只維護正式站（https://modlangforge.com）與 `main` 分支的最新程式碼，不提供舊版本的修補。

## 回報漏洞

請使用 GitHub 的私密漏洞回報：[回報安全性漏洞](https://github.com/MrPippi/ModLangForge/security/advisories/new)（Security → Report a vulnerability）。

**請勿**在公開的 issue、Pull Request 或討論區揭露漏洞細節。

## 適用範圍

- Worker API（`/api/v1/*`）
- OAuth 登入（Discord／GitHub）與工作階段
- 管理與審核 API（`/admin/` 與相關端點）
- 發佈流程（GitHub App、站內發佈 commit）

不在範圍內：需要實體存取使用者裝置的攻擊、純社交工程、對第三方服務（Cloudflare、GitHub、Discord）本身的問題，以及自動化掃描器的無實證報告。

## 請附上

- 受影響的網址或端點，以及漏洞類型
- 重現步驟或概念驗證（PoC）
- 預期與實際行為、可能的影響
- 相關日誌或截圖（請先移除個人資料與金鑰）

## 回應時間

本專案為業餘維護，無法保證固定時限，但會盡力在合理時間內確認回報、修補並於公開前通知你；若你希望署名致謝，請在回報中註明。
