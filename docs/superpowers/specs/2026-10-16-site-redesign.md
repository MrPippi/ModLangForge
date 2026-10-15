# 全站視覺重新設計

## 目標

- 修正 UI 審查列出的 12 項問題（對比度、觸控尺寸、焦點樣式、ARIA 語意、跳至主內容）。
- 視覺方向「結構乾淨＋像素點綴」：版面維持易讀的現代工具網站，Minecraft 氛圍只透過像素字型、硬邊陰影、分格進度條與自繪像素 icon 呈現。
- 全站不使用 emoji 或以符號字元充當 icon，一律改用 `PixelIcon`（自繪 16×16 SVG）。
- 深淺色：預設跟隨系統，Header 提供切換鈕並以 `localStorage` 記住偏好。

## 設計 token

全部定義於 `apps/site/src/styles/global.css`，元件只使用語意 class（`bg-surface`、`text-muted`、`border-line`…），不再直接寫 `slate-*`、`emerald-*`。

| Token | 淺色 | 深色 | 用途 |
|---|---|---|---|
| `bg` | `#f6f4ee` | `#1a1c19` | 頁面底色 |
| `surface` / `surface-2` | `#fffefb` / `#eeebe2` | `#232622` / `#2c302b` | 卡片、次層區塊 |
| `line` / `line-strong` | `#d9d4c7` / `#4a4740` | `#3a3f38` / `#646b60` | 分隔線、卡片外框 |
| `fg` / `muted` | `#1f1d1a` / `#5c574e` | `#ecebe4` / `#a8a69c` | 文字 |
| `primary` / `on-primary` | `#3b7a2a` / `#ffffff` | `#6fbf4a` / `#0f1a0b` | 主要按鈕（皆 ≥ 4.5:1） |
| `link` | `#2f6421` | `#8fd16a` | 連結、目前頁面 |
| `danger` / `warn` / `info` | `#b42318` / `#8a5a00` / `#1d5f8a` | `#f87171` / `#f0b84a` / `#7cc4f0` | 狀態文字 |

## 字型

- 內文：系統中文字型堆疊（不額外下載，避免數 MB 的中文字型）。
- 標題／Logo：俐方體 11 號（Cubic 11，OFL 1.1），以 `scripts/subset-pixel-font.ts` 依原始碼中出現的字元子集化成 `public/fonts/cubic-11-subset.woff2`。缺字自動退回內文字型。UI 文字變動後需重跑腳本。

## 元件決策

- `ModCard`、`StatusBadge`、`ProgressBar`、`PixelIcon` 改為 React 元件（`src/components/*.tsx`），Astro 頁面靜態渲染、`ModsBrowser` 共用，避免兩份實作。
- `CartBadge` 改為絕對定位，水合後出現不推擠導覽列。
- 翻譯器工作區在窄螢幕改為上下排列。
- 不使用任何 Mojang 素材；像素圖案（Logo 草方塊、Hero 草地帶）皆為自繪 SVG/CSS。
