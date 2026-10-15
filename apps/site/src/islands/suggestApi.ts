import { apiSend, type FetchLike } from './api';

export interface SuggestionInput {
  readonly modId: string;
  readonly key: string;
  readonly proposed: string;
  readonly note?: string;
  readonly turnstileToken: string;
}

export type SubmitResult = { ok: true; id: number; formatWarning: boolean } | { ok: false; code: string; message: string };

export async function submitSuggestion(input: SuggestionInput, fetchImpl: FetchLike = fetch): Promise<SubmitResult> {
  const result = await apiSend<{ id: number; formatWarning: boolean }>('/api/v1/suggestions', 'POST', input, fetchImpl);
  return result.ok ? { ok: true, id: result.data.id, formatWarning: result.data.formatWarning } : { ok: false, code: result.code, message: result.message };
}
