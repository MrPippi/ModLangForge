import JSZip from 'jszip';
import { questLangPath, questLangText } from '../ftbquests/langFile';
import type { QuestLayout } from '../ftbquests/schema';

export const INSTALL_GUIDE_FILE = '安裝說明.txt';
export const RESOURCEPACKS_DIR = 'resourcepacks';

/** 一個整合包的任務譯文 */
export interface QuestPart {
  readonly modpackId: string;
  readonly layout: QuestLayout;
  readonly translations: Readonly<Record<string, string>>;
}

export interface BundleResourcePack {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

export interface BundleOptions {
  /** 安裝說明的第一行 */
  readonly title: string;
  /** 沒有任何資源包內容時為 null */
  readonly resourcePack: BundleResourcePack | null;
  readonly quests: readonly QuestPart[];
}

/** 任務檔（路徑 → 內容）；沒有已翻條目的整合包略過；多個整合包時各放在 <modpackId>/ 底下以免互相覆蓋 */
export function questBundleFiles(parts: readonly QuestPart[]): [string, string][] {
  const filled = parts.filter((p) => Object.values(p.translations).some((text) => text !== ''));
  const prefix = (p: QuestPart): string => (filled.length > 1 ? `${p.modpackId}/` : '');
  return filled.map((p): [string, string] => [`${prefix(p)}${questLangPath(p.layout)}`, questLangText(p.translations)]);
}

/** 台灣繁中、玩家用語的安裝說明 */
export function installGuide(title: string, resourcePack: string | null, hasQuests: boolean, nested = false): string {
  const steps = [
    '把這個壓縮檔解壓縮到整合包的資料夾（有 mods、config 資料夾的那一層）。',
    ...(resourcePack
      ? [`${RESOURCEPACKS_DIR} 資料夾裡的 ${resourcePack} 不用再解壓縮；進遊戲後到「選項 → 資源包」啟用它，語言選「繁體中文（台灣）」。`]
      : []),
    ...(hasQuests
      ? [
        'config 資料夾裡是 FTB 任務的翻譯，放好後重新進入世界就會顯示中文；還沒翻的任務會維持英文。',
        '在伺服器上玩時，FTB 任務的翻譯要放到伺服器的 config 資料夾（請伺服器管理員放置）。',
        ...(nested ? ['壓縮檔裡每個整合包各有一個資料夾，請把其中的 config 資料夾放到對應的整合包資料夾。'] : []),
      ]
      : []),
  ];
  return [title, '', '安裝方式：', ...steps.map((step, i) => `${i + 1}. ${step}`), ''].join('\n');
}

/** 兩部分的下載檔：resourcepacks/ 放資源包、config/ 放任務翻譯，另附安裝說明 */
export async function buildBundle(opts: BundleOptions): Promise<Blob> {
  const zip = new JSZip();
  const quests = questBundleFiles(opts.quests);
  zip.file(INSTALL_GUIDE_FILE, installGuide(opts.title, opts.resourcePack?.fileName ?? null, quests.length > 0, quests.length > 1));
  if (opts.resourcePack) zip.file(`${RESOURCEPACKS_DIR}/${opts.resourcePack.fileName}`, opts.resourcePack.bytes);
  for (const [path, text] of quests) zip.file(path, text);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}
