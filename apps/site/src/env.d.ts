interface ImportMetaEnv {
  /** GitHub repo（owner/name），用於編輯、回報連結 */
  readonly PUBLIC_REPO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
