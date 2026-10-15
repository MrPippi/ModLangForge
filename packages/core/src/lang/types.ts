export interface ParsedLang {
  readonly entries: Readonly<Record<string, string>>;
  readonly order: readonly string[];
  readonly warnings: readonly string[];
}

export class LangParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LangParseError';
  }
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
