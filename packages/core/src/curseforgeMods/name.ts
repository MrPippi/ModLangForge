const LOADER = String.raw`(?:neo\s*forge|\(neo\)\s*forge|forge|fabric|quilt)`;
const LOADER_LIST = String.raw`${LOADER}(?:\s*(?:[&/,+]|and)\s*${LOADER})*`;
// (NeoForge)、[Forge & Fabric]
const BRACKETED = new RegExp(String.raw`\s*[(\[]\s*${LOADER_LIST}\s*[)\]]$`, 'i');
// - (Neo)Forge
const DASHED = new RegExp(String.raw`\s+[-–—]\s+${LOADER_LIST}$`, 'i');
// Fabric/Forge（單獨一個載入器字樣可能是名稱的一部分，所以必須有分隔符號）
const BARE_LIST = new RegExp(String.raw`\s+${LOADER}(?:\s*(?:[&/,+]|and)\s*${LOADER})+$`, 'i');
// 1.8.+、1.20.1
const MC_VERSION = /\s+1\.\d+(?:\.(?:\d+|\+|x))?\+?$/i;
const TAGS = [BRACKETED, DASHED, BARE_LIST, MC_VERSION];

/** 去掉 CurseForge 標題結尾的載入器／MC 版本標示（如「 (NeoForge)」「 1.8.+」）；其他括號（如 Legacy）保留 */
export function cleanCurseforgeName(name: string): string {
  let current = name.trim();
  for (let changed = true; changed; ) {
    changed = false;
    for (const tag of TAGS) {
      const next = current.replace(tag, '').trim();
      if (next !== current && next !== '') {
        current = next;
        changed = true;
      }
    }
  }
  return current;
}
