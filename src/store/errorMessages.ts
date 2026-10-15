import { JarError } from '../core/jar';
import { t } from '../i18n/zh-TW';

/** 將 jar 讀取錯誤轉為繁中訊息 */
export function jarErrorMessage(fileName: string, err: unknown): string {
  if (!(err instanceof JarError)) return t.errors.unknown(fileName);
  switch (err.code) {
    case 'not-zip':
      return t.errors.notZip(fileName);
    case 'no-lang':
      return t.errors.noLang(fileName);
    case 'too-large':
      return t.errors.tooLarge(fileName);
    case 'parse':
      return t.errors.parse(fileName, err.path ?? '', err.message);
  }
}
