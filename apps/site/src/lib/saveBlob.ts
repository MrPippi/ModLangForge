import type { ExportResult } from '@mlf/core/export';

const REVOKE_DELAY_MS = 1000;

/** 觸發瀏覽器下載 */
export function saveBlob({ blob, fileName }: ExportResult): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
