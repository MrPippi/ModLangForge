import { stripBom } from '../lang/types';

export type SnbtArrayType = 'B' | 'I' | 'L';

/** SNBT 值；數字保留原始文字（含字尾），避免 long 失去精度 */
export type SnbtValue =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly raw: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'null' }
  | { readonly kind: 'list'; readonly items: readonly SnbtValue[] }
  | { readonly kind: 'array'; readonly type: SnbtArrayType; readonly items: readonly string[] }
  | { readonly kind: 'compound'; readonly entries: Readonly<Record<string, SnbtValue>> };

export type SnbtCompound = Extract<SnbtValue, { readonly kind: 'compound' }>;

export class SnbtParseError extends Error {
  readonly line: number;

  constructor(line: number, reason: string) {
    super(`第 ${line} 行：${reason}`);
    this.name = 'SnbtParseError';
    this.line = line;
  }
}

/** 巢狀上限：避免惡意檔案造成堆疊溢位 */
export const MAX_SNBT_DEPTH = 256;

/** FTB Library SNBTUtils 的跳脫字元，加上 JSON5 的 \' 與 \/ */
const ESCAPES: Readonly<Record<string, string>> = { '"': '"', "'": "'", '\\': '\\', '/': '/', t: '\t', b: '\b', n: '\n', r: '\r', f: '\f' };
const HEX4 = /^[0-9A-Fa-f]{4}$/;
const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?[bBsSlLfFdD]?$/;
/** FTB Library SNBTUtils.isSimpleCharacter：字母、數字、. _ - + ∞ */
const WORD_CHAR = /^[\p{L}\p{N}._+\-∞]$/u;
const ARRAY_TYPES: Readonly<Record<string, SnbtArrayType>> = { B: 'B', b: 'B', I: 'I', i: 'I', L: 'L', l: 'L' };
const KEYWORDS: Readonly<Record<string, SnbtValue>> = {
  true: { kind: 'boolean', value: true },
  false: { kind: 'boolean', value: false },
  null: { kind: 'null' },
  end: { kind: 'null' },
  END: { kind: 'null' },
};

function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

class Parser {
  private readonly text: string;
  private pos = 0;

  constructor(text: string) {
    this.text = text;
  }

  error(reason: string, at: number = this.pos): SnbtParseError {
    let line = 1;
    for (let i = 0; i < at && i < this.text.length; i += 1) {
      if (this.text[i] === '\n') line += 1;
    }
    return new SnbtParseError(line, reason);
  }

  private peek(offset = 0): string | undefined {
    return this.text[this.pos + offset];
  }

  /** 略過空白與註解（# 與 // 到行尾、區塊註解） */
  private skip(): void {
    for (;;) {
      const c = this.peek();
      if (c === undefined) return;
      if (c <= ' ') {
        this.pos += 1;
      } else if (c === '#' || (c === '/' && this.peek(1) === '/')) {
        const end = this.text.indexOf('\n', this.pos);
        this.pos = end === -1 ? this.text.length : end + 1;
      } else if (c === '/' && this.peek(1) === '*') {
        const end = this.text.indexOf('*/', this.pos + 2);
        if (end === -1) throw this.error('註解缺少結尾的 */');
        this.pos = end + 2;
      } else {
        return;
      }
    }
  }

  /** 元素之間的逗號可省略、可重複 */
  private separators(): void {
    for (;;) {
      this.skip();
      if (this.peek() !== ',') return;
      this.pos += 1;
    }
  }

  value(depth: number): SnbtValue {
    if (depth > MAX_SNBT_DEPTH) throw this.error(`巢狀超過 ${MAX_SNBT_DEPTH} 層`);
    this.skip();
    const c = this.peek();
    if (c === undefined) throw this.error('檔案意外結束');
    if (c === '{') return this.compound(depth + 1);
    if (c === '[') return this.collection(depth + 1);
    if (c === '"' || c === "'") return { kind: 'string', value: this.quoted() };
    return this.word();
  }

  private compound(depth: number): SnbtCompound {
    const start = this.pos;
    this.pos += 1;
    const entries = new Map<string, SnbtValue>();
    for (;;) {
      this.separators();
      const c = this.peek();
      if (c === undefined) throw this.error('缺少結尾的 }', start);
      if (c === '}') {
        this.pos += 1;
        // Object.fromEntries 以自有屬性建立，__proto__ 等 key 不會改到 prototype
        return { kind: 'compound', entries: Object.fromEntries(entries) };
      }
      const key = c === '"' || c === "'" ? this.quoted() : this.wordText();
      this.skip();
      const sep = this.peek();
      if (sep !== ':' && sep !== '=') throw this.error(`「${key}」後面應該是冒號`);
      this.pos += 1;
      entries.set(key, this.value(depth));
    }
  }

  private collection(depth: number): SnbtValue {
    const start = this.pos;
    const type = own(ARRAY_TYPES, this.peek(1) ?? '');
    if (type !== undefined && this.peek(2) === ';') {
      this.pos += 3;
      return this.array(type, depth, start);
    }
    this.pos += 1;
    const items: SnbtValue[] = [];
    for (;;) {
      this.separators();
      const c = this.peek();
      if (c === undefined) throw this.error('缺少結尾的 ]', start);
      if (c === ']') {
        this.pos += 1;
        return { kind: 'list', items };
      }
      items.push(this.value(depth));
    }
  }

  private array(type: SnbtArrayType, depth: number, start: number): SnbtValue {
    const items: string[] = [];
    for (;;) {
      this.separators();
      const c = this.peek();
      if (c === undefined) throw this.error('缺少結尾的 ]', start);
      if (c === ']') {
        this.pos += 1;
        return { kind: 'array', type, items };
      }
      const item = this.value(depth);
      if (item.kind !== 'number') throw this.error('型別陣列只能放數字');
      items.push(item.raw);
    }
  }

  private quoted(): string {
    const quote = this.peek();
    const start = this.pos;
    this.pos += 1;
    const parts: string[] = [];
    for (;;) {
      const c = this.peek();
      if (c === undefined || c === '\n') throw this.error('字串缺少結尾的引號（字串不可跨行）', start);
      this.pos += 1;
      if (c === quote) return parts.join('');
      parts.push(c === '\\' ? this.escape(start) : c);
    }
  }

  /** 反斜線後的字元；依 FTB Library SNBTParser，未知的跳脫字元整個捨棄 */
  private escape(start: number): string {
    const e = this.peek();
    if (e === undefined) throw this.error('字串缺少結尾的引號（字串不可跨行）', start);
    this.pos += 1;
    const hex = this.text.slice(this.pos, this.pos + 4);
    if (e === 'u' && HEX4.test(hex)) {
      this.pos += 4;
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    return own(ESCAPES, e) ?? '';
  }

  private wordText(): string {
    const start = this.pos;
    while (this.pos < this.text.length && WORD_CHAR.test(this.text[this.pos] ?? '')) this.pos += 1;
    if (this.pos === start) throw this.error(`無法辨識的字元「${this.peek() ?? ''}」`);
    return this.text.slice(start, this.pos);
  }

  /** 未加引號的字詞：關鍵字、數字（保留原文）或字串 */
  private word(): SnbtValue {
    const text = this.wordText();
    const keyword = own(KEYWORDS, text);
    if (keyword) return keyword;
    return NUMBER.test(text) ? { kind: 'number', raw: text } : { kind: 'string', value: text };
  }

  end(): void {
    this.skip();
    if (this.pos < this.text.length) throw this.error('結尾有多餘的內容');
  }
}

/** 讀取 FTB Quests 的 .snbt（FTB Library SNBT，也接受 JSON5）；最外層必須是 { } */
export function parseSnbt(text: string): SnbtCompound {
  const parser = new Parser(stripBom(text));
  const root = parser.value(0);
  if (root.kind !== 'compound') throw parser.error('最外層必須是 { } 物件', 0);
  parser.end();
  return root;
}

export function field(c: SnbtCompound, name: string): SnbtValue | undefined {
  return own(c.entries, name);
}

export function stringField(c: SnbtCompound, name: string): string | undefined {
  const v = field(c, name);
  return v?.kind === 'string' ? v.value : undefined;
}

export function listField(c: SnbtCompound, name: string): readonly SnbtValue[] | undefined {
  const v = field(c, name);
  return v?.kind === 'list' ? v.items : undefined;
}

export function compounds(items: readonly SnbtValue[] | undefined): SnbtCompound[] {
  return (items ?? []).flatMap((i) => (i.kind === 'compound' ? [i] : []));
}
