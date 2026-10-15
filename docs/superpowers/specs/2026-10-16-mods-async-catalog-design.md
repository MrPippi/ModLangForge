# 模組目錄非同步載入（/mods）設計

## 問題

`mods/index.astro` 在 build 時把全部模組摘要當成 `ModsBrowser` 的 props，
同一份資料在 HTML 中出現兩次（SSR 列表＋hydration props），頁面大小隨模組數線性成長。
篩選只有載入器與 MC 版本，模組變多後難以找到特定狀態的模組。

## 決策

1. **首屏 SSR 固定筆數**：頁面只傳前 24 筆（依名稱排序）與模組總數給 island，HTML 大小與模組數無關。
   無 JS 時顯示這 24 筆與「需啟用 JavaScript 才能瀏覽完整目錄」提示；完整收錄由 sitemap 與模組頁負責。
2. **完整清單從既有 API 載入**：hydrate 後 fetch `/api/v1/index.json`，不新增資料契約。
   回應以新的 `modSummarySchema`（zod）驗證，驗證失敗視同載入失敗。
3. **漸進渲染**而非虛擬捲動：先渲染 48 張卡片，`IntersectionObserver` 觸底再加 48 張。
   篩選或排序變更時重設為 48 張。不支援 `IntersectionObserver` 的環境一次渲染全部。
4. **新增排序與狀態篩選**：
   - 排序：名稱（預設，`localeCompare`）、最近更新（沿用 `byUpdatedDesc`）、完成度（`percent` 由高到低，同分依名稱）。
   - 狀態篩選：`TRANSLATION_STATUSES`（machine／partial／reviewed），標籤沿用 `STATUS_LABELS`。
   - 載入完成前，篩選與排序控制項停用並顯示「載入中…」。
5. **快取**：`public/_headers` 對 `/api/v1/*` 加 `Cache-Control: public, max-age=300`。
6. **錯誤處理**：fetch 失敗、非 2xx 或驗證失敗時保留 SSR 的 24 筆，
   顯示「目錄載入失敗」訊息、「重試」按鈕與「改用搜尋」連結（`/`），並以 `console.error` 記錄原因。

## 元件（`apps/site/src/islands/`）

| 檔案 | 職責 |
|---|---|
| `catalogIndex.ts` | `modSummarySchema`、`fetchCatalogIndex(fetchImpl?)`：fetch＋驗證，回傳 `ModSummary[]` 或丟出錯誤 |
| `useCatalogIndex.ts` | React hook，狀態 `{ kind: 'loading' } \| { kind: 'ready', mods } \| { kind: 'error' }`，提供 `retry()` |
| `filterMods.ts`（擴充） | 純函式 `filterMods(mods, { loader, version, status })`、`sortMods(mods, key)` |
| `useIncrementalList.ts` | 漸進渲染 hook：回傳可見切片與哨兵元素 ref；`resetKey` 改變時重設 |
| `ModsBrowser.tsx` | 組合以上，props 改為 `{ initial: ModSummary[]; total: number }` |

`ModSummary` 型別維持在 `lib/data.ts`，schema 以 `satisfies` 對齊，避免兩處定義漂移。
新增的 UI 文字放入 `i18n/zh-TW.ts` 的 `mods` 區塊。

## 測試

- 單元：`filterMods`／`sortMods`、`modSummarySchema` 與 `fetchCatalogIndex`（成功、非 2xx、格式錯誤）、
  `useIncrementalList`（mock `IntersectionObserver`）。
- 元件：`ModsBrowser.test.tsx` 涵蓋 SSR 首屏、載入後完整清單、狀態篩選＋排序、錯誤與重試。
- E2E：`/mods` 篩選 `reviewed`＋依最近更新排序，確認數量與順序。

## 不在範圍

- 列表內文字篩選（由 Pagefind 搜尋負責）。
- 篩選／排序狀態寫入 URL。
- `index.json` 分片（模組數達數千時另案處理）。
- 靜態分頁路由（日後可在不改 island 的前提下加上）。
