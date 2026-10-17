import JSZip from 'jszip';
import { parseSnbt, readQuestLang } from '../ftbquests';

/** 測試用：壓縮檔內的檔案路徑（不含資料夾項目），已排序 */
export function zipFileNames(zip: JSZip): string[] {
  return Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name).sort();
}

/** 測試用：開啟壓縮檔內的壓縮檔（例如 resourcepacks/<id>-zh_tw.zip）；檔案不存在時得到空的壓縮檔 */
export async function zipInnerZip(zip: JSZip, path: string): Promise<JSZip> {
  return JSZip.loadAsync((await zip.file(path)?.async('uint8array')) ?? new Uint8Array());
}

/** 測試用：讀出壓縮檔內任務 lang 檔的文字（key → 文字；清單欄位以 \n 合併） */
export async function zipQuestTexts(zip: JSZip, path: string): Promise<Readonly<Record<string, string>>> {
  return readQuestLang(parseSnbt((await zip.file(path)?.async('string')) ?? '')).texts;
}
