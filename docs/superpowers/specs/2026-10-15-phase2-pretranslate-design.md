# 第二階段：熱門模組預翻（設計紀錄）

- 日期：2026-10-15
- 狀態：已實作（使用者在對話中核准設計）

## 決策

- 暫不匯入外部翻譯。ModsTranslationPack 為 CC BY-NC-ND 4.0（禁止改作，與線上修正衝突）；CFPA 很可能是 CC BY-NC-SA 4.0 且為簡中。取得授權後再接上。
- 預翻由 Claude 在對話中逐一翻譯，不使用 API 金鑰。所有預翻模組標記 `status: machine`、來源「Claude 機器翻譯」、授權 CC BY-SA 4.0。
- 授權允許清單（`LICENSE_ALLOWLIST`）：CC-BY-4.0、CC-BY-SA-4.0、CC-BY-NC-SA-4.0、CC0-1.0。未列入者 schema 驗證失敗。

## 流程

1. `npm run fetch:modrinth -- --limit 15`：依 Modrinth 下載量掃描，下載支援 1.21.1／1.20.1 的 jar，以 `readJar` 擷取 `en_us`。
2. `selectForTranslation` 篩選：
   - 內建 `zh_tw` 涵蓋率 ≥ 90%：跳過。
   - 內建 `zh_tw` 不完整：只保留缺少的 key（資源包與內建語言檔逐條合併），記錄 `translation.builtinPercent`，不收錄作者的譯文。
   - 剩餘 key 少於 20 或多於 1500：跳過。
3. 產生 `data/mods/<modId>/{mod.json,en_us.json,zh_tw.json}`，人工（Claude）翻譯並補上繁中簡介。
4. `npm run validate:data` 必須 0 錯誤、0 警告。

## 結果（2026-10-15）

15 個模組、約 2,870 條。熱門前 70 名中有 19 個模組內建繁中已完整而被跳過，8 個為部分內建。
