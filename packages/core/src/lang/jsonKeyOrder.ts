/**
 * 取得 JSON 頂層物件 key 的原始順序。
 * JSON.parse 會把整數形式的 key 排到最前面，因此需自行掃描。
 * 呼叫前須確認文字為合法 JSON。
 */
export function topLevelKeyOrder(text: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let i = 0;
  let expectKey = false;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      const end = findStringEnd(text, i);
      if (depth === 1 && expectKey) {
        keys.push(JSON.parse(text.slice(i, end + 1)) as string);
        expectKey = false;
      }
      i = end + 1;
      continue;
    }
    if (ch === '{' || ch === '[') {
      depth += 1;
      expectKey = depth === 1 && ch === '{';
    } else if (ch === '}' || ch === ']') {
      depth -= 1;
    } else if (ch === ',' && depth === 1) {
      expectKey = true;
    }
    i += 1;
  }
  return keys;
}

function findStringEnd(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === '\\') i += 2;
    else if (text[i] === '"') return i;
    else i += 1;
  }
  return text.length - 1;
}
