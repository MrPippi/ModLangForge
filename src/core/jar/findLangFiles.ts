import type { LangFormat } from '../../types';

export interface LangFileRef {
  readonly namespace: string;
  /** 小寫，例如 en_us */
  readonly locale: string;
  readonly format: LangFormat;
  readonly path: string;
}

const LANG_PATH = /^assets\/([^/]+)\/lang\/([^/]+)\.(json|lang)$/i;

export function findLangFiles(paths: readonly string[]): LangFileRef[] {
  return paths.flatMap((path) => {
    const m = LANG_PATH.exec(path);
    if (!m) return [];
    const [, namespace = '', locale = '', ext = ''] = m;
    return [{ namespace, locale: locale.toLowerCase(), format: ext.toLowerCase() as LangFormat, path }];
  });
}
