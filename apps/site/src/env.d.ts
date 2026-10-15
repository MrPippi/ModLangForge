interface ImportMetaEnv {
  /** GitHub repo（owner/name），用於翻譯需求連結 */
  readonly PUBLIC_REPO?: string;
  /** 'true' 時啟用站內「建議修改」流程（需要 Worker）；其他值改用 GitHub 連結 */
  readonly PUBLIC_SUGGEST_ENABLED?: string;
  /** Cloudflare Turnstile site key */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
