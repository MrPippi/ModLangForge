export interface SuggestionInput {
  readonly modId: string;
  readonly key: string;
  readonly proposed: string;
  readonly note?: string;
  readonly turnstileToken: string;
}

export type SubmitResult = { ok: true; id: number; formatWarning: boolean } | { ok: false; code: string; message: string };

const NETWORK_ERROR: SubmitResult = { ok: false, code: 'network', message: '連線失敗，請檢查網路後再試。' };

export async function submitSuggestion(input: SuggestionInput, fetchImpl: typeof fetch = fetch): Promise<SubmitResult> {
  try {
    const res = await fetchImpl('/api/v1/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = (await res.json()) as { ok: boolean; data?: { id: number; formatWarning: boolean }; error?: { code: string; message: string } };
    if (body.ok && body.data) return { ok: true, id: body.data.id, formatWarning: body.data.formatWarning };
    return { ok: false, code: body.error?.code ?? 'unknown', message: body.error?.message ?? '送出失敗，請稍後再試。' };
  } catch {
    return NETWORK_ERROR;
  }
}
