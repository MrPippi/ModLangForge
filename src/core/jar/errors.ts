export const MAX_JAR_BYTES = 200 * 1024 * 1024;
export const MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;

export type JarErrorCode = 'not-zip' | 'no-lang' | 'too-large' | 'parse';

/** jar 讀取錯誤；UI 依 code 對應繁中訊息 */
export class JarError extends Error {
  readonly code: JarErrorCode;
  readonly path?: string;

  constructor(code: JarErrorCode, message: string, path?: string) {
    super(message);
    this.name = 'JarError';
    this.code = code;
    this.path = path;
  }
}
