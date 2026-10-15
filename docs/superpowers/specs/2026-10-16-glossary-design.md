# 術語表與跨模組一致性檢查設計

## 問題

同一個英文詞在不同模組可能被譯成不同說法（例如 Enchantment 譯為「附魔」與「魔咒」），玩家會誤以為是不同東西。
目前 `validateModData` 只做單一模組內的檢查（schema、格式碼、孤兒 key），translator 也只提示格式碼。
CONTRIBUTING 的「名詞保持一致」完全靠人工把關。

## 決策

1. **術語表由人工維護，工具只提供建議**：`npm run glossary:mine` 掃描現有譯文產生候選報告，不寫入任何資料。
2. **兩層術語表**：
   - 全域：`data/glossary.json`（必有，可為空清單）。
   - 模組：`data/mods/<modId>/glossary.json`（選填），只套用到該模組。
   - 同一英文詞（不分大小寫）兩層都有時，以模組表為準。
3. **違規只警告，可逐詞升級**：每個詞的 `level` 預設 `warning`；設為 `error` 時，違規會讓 `validate:data` 失敗。
4. **translator 提示**：每列在原文下方列出命中的術語，譯文未使用的詞標黃色。

## 資料格式

```json
{
  "terms": [
    { "en": "Cogwheel", "zh": "齒輪" },
    { "en": "Enchantment", "zh": "附魔", "level": "error", "note": "原版用語" }
  ]
}
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `en` | 非空字串（去頭尾空白後） | 英文詞，可為多字詞 |
| `zh` | 非空字串（去頭尾空白後） | 規定譯名 |
| `level` | `"warning"` \| `"error"`，選填 | 預設 `"warning"` |
| `note` | 字串，選填 | 說明，供人閱讀 |

驗證（`validate:data`）：
- 不符合 schema → error（檔案：`glossary.json`）。
- 同一檔案內 `en` 重複（不分大小寫）→ error。
- 全域表的問題以 modId `(glossary)` 回報；模組表的問題以該 modId 回報。
- 全域表有 error 時，所有模組的術語檢查略過（只回報術語表本身的錯誤）。

## 比對規則

- 英文比對不分大小寫，以完整單字為界（`\b`），多字詞之間的空白可為任意空白字元。
- 自動接受最後一個單字加上 `s` 或 `es`（`Cogwheel` 命中 `Cogwheels`）。
- **長詞優先**：若某次命中範圍完全落在另一個較長術語的命中範圍內，該次命中不計（`Large Cogwheel` 命中時不再要求 `Cogwheel`）。
- 違規判定：原文命中某術語，但譯文不包含其 `zh` 字串 → 一筆 issue，等級依 `level`。
- 略過：譯文為空字串，或譯文與原文完全相同（視為未翻譯）。
- 同一條目同一術語只回報一次。

## 元件

`packages/core/src/glossary/`：

| 檔案 | 職責 |
|---|---|
| `schema.ts` | `glossaryTermSchema`、`glossaryFileSchema`（zod）、型別 `GlossaryTerm`（`level` 已補預設值） |
| `match.ts` | `findTerms(source, terms): GlossaryTerm[]`，套用單字邊界、複數、長詞優先 |
| `check.ts` | `checkGlossary(source, target, terms): GlossaryIssue[]`；`GlossaryIssue = { term, level }` |
| `merge.ts` | `mergeGlossaries(global, mod): GlossaryTerm[]` |
| `validateGlossary.ts` | 檔案層級驗證（schema＋重複），回傳 issue 清單 |

- `ModIssue.file` 加入 `'glossary.json'`。
- `validateModData` 新增參數 `terms`（合併後），在 `crossIssues` 之後執行術語檢查，訊息格式：`術語「Cogwheel」應譯為「齒輪」`。
- `loadAllMods` 讀取全域表與各模組表（模組表不存在視為空）。

## 探勘工具

`scripts/mine-glossary.ts`（`npm run glossary:mine`），輸出 Markdown 到 stdout：
1. **譯法不一致候選**：收集所有模組中英文原文為 1–3 個單字、且已翻譯（非空、與原文不同）的條目；
   依英文（小寫、去頭尾空白）分組，同組出現 2 種以上譯文者列出，附每種譯文與出處（`modId:key`），依出現模組數排序。
2. **現有術語違規數**：每個術語在全部資料中的違規次數與前 5 個出處。

## 網站與 translator

- 新增靜態端點 `apps/site/src/pages/api/v1/glossary.json.ts`：
  `{ version: 1, global: GlossaryTerm[], mods: Record<modId, GlossaryTerm[]> }`（`mods` 只含有模組表者）。
- translator 新增 `glossaryClient`：fetch＋zod 驗證，載入一次；失敗時不顯示提示並 `console.error`，不影響翻譯。
- 套用術語：`mergeGlossaries(global, mods[modId] ?? [])`，modId 取自上傳 jar 的 modId。
- `TranslationRow` 在原文下方顯示「術語：Cogwheel→齒輪、Shaft→傳動軸」；譯文未包含的詞以警告色標示；未命中任何術語時不顯示。

## 文件

- `CONTRIBUTING.md` 新增「術語表」段落：格式、兩層規則、`level` 用法、如何看探勘報告。
- 初版 `data/glossary.json` 收錄少量確定詞（從探勘報告挑選，無歧義者）。

## 測試

- core：`findTerms`（大小寫、單字邊界、複數、多字詞、長詞優先）、`checkGlossary`（略過規則、level）、`mergeGlossaries`（模組覆蓋）、檔案驗證（schema、重複）、`validateModData` 整合、`loadAllMods` 讀取。core 覆蓋率維持 ≥ 80%。
- site：`glossaryClient`（成功、失敗）、`TranslationRow` 術語提示（命中、未使用標示、無命中不顯示）。
- E2E：translator 上傳 jar 後顯示術語提示。

## 不在範圍

- 一鍵插入術語、建議回報視窗（SuggestDialog）的術語提示。
- 自動修正譯文、例外標註機制。
- 中文同義詞／變體（`zh` 僅一個字串）。
