import { questLangFileName, questLangText } from '../ftbquests/langFile';
import type { QuestLayout } from '../ftbquests/schema';
import type { ExportResult } from './types';

/** 一個整合包的任務譯文 */
export interface QuestPart {
  readonly modpackId: string;
  readonly layout: QuestLayout;
  readonly translations: Readonly<Record<string, string>>;
}

/** 任務檔：沒有已翻條目的整合包略過；多個整合包時檔名加上 <modpackId>- 以免互相覆蓋 */
export function questFiles(parts: readonly QuestPart[]): ExportResult[] {
  const filled = parts.filter((p) => Object.values(p.translations).some((text) => text !== ''));
  const prefix = (p: QuestPart): string => (filled.length > 1 ? `${p.modpackId}-` : '');
  return filled.map((p) => ({
    fileName: `${prefix(p)}${questLangFileName(p.layout)}`,
    blob: new Blob([questLangText(p.translations)], { type: 'text/plain;charset=utf-8' }),
  }));
}
