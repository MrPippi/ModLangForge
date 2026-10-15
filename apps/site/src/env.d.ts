interface ImportMetaEnv {
  /** GitHub repo（owner/name），用於編輯、回報連結 */
  readonly PUBLIC_REPO?: string;
  /** Cloudflare Turnstile site key */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
