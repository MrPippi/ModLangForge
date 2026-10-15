export type ExportKind = 'merged-pack' | 'separate-packs' | 'lang-files';

export type UntranslatedMode = 'keep-source' | 'skip';

export interface ExportOptions {
  readonly kind: ExportKind;
  readonly untranslated: UntranslatedMode;
  readonly mcVersion: string;
  readonly description: string;
}

export interface ExportResult {
  readonly fileName: string;
  readonly blob: Blob;
}
