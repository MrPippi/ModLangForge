import JSZip from 'jszip';

/** 測試用：由「路徑 → 內容」產生 jar（zip）位元組 */
export async function makeJar(files: Readonly<Record<string, string>>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: 'uint8array' });
}

export function makeJarFile(name: string, bytes: Uint8Array): File {
  return new File([bytes as BlobPart], name, { type: 'application/java-archive' });
}
