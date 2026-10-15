import type { LangFormat } from '../../types';

export interface LangFileRef {
  readonly namespace: string;
  /** 小寫，例如 en_us */
  readonly locale: string;
  readonly format: LangFormat;
  readonly path: string;
}

const LANG_PATH = /^assets\/([^/]+)\/lang\/([^/]+)\.(json|lang)$/i;
/** Minecraft 命名空間允許的字元；同時排除 . 與 .. 以免匯出路徑跳脫 */
const VALID_NAMESPACE = /^[a-z0-9_.-]+$/;

function isValidNamespace(ns: string): boolean {
  return VALID_NAMESPACE.test(ns) && ns !== '.' && ns !== '..';
}

export function findLangFiles(paths: readonly string[]): LangFileRef[] {
  return paths.flatMap((path) => {
    const m = LANG_PATH.exec(path);
    if (!m) return [];
    const [, namespace = '', locale = '', ext = ''] = m;
    if (!isValidNamespace(namespace)) return [];
    return [{ namespace, locale: locale.toLowerCase(), format: ext.toLowerCase() as LangFormat, path }];
  });
}
