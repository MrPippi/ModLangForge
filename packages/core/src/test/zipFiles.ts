import type JSZip from 'jszip';

/** 測試用：壓縮檔內的檔案路徑（不含資料夾項目），已排序 */
export function zipFileNames(zip: JSZip): string[] {
  return Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name).sort();
}
