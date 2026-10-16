import { useMemo, useRef, useState } from 'react';
import type { FetchLike } from '../islands/api';
import type { AdminApi } from './adminApi';
import { buildHits, latestApproved } from './editorHits';
import { fetchModStrings, type ModStrings } from './modStrings';
import { s } from './strings';

export type Message = { readonly kind: 'ok' | 'error'; readonly text: string };
type Loaded = { readonly modId: string; readonly strings: ModStrings };
type Overrides = Readonly<Record<string, string>>;

export function useDirectEdit(api: AdminApi, fetchImpl: FetchLike) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const inFlight = useRef(new Set<string>());

  const open = async (rawId: string) => {
    const modId = rawId.trim();
    setMessage(null);
    const [strings, approved] = await Promise.all([fetchModStrings(modId, fetchImpl), api.listSuggestions('approved', modId)]);
    if (!strings) {
      setLoaded(null);
      setMessage({ kind: 'error', text: s.modNotFound });
      return;
    }
    setOverrides(approved.ok ? latestApproved(approved.data.suggestions) : {});
    setLoaded({ modId, strings });
  };

  const commit = async (modId: string, key: string, target: string) => {
    if (inFlight.current.has(key)) {
      setMessage({ kind: 'error', text: s.stillSaving(key) });
      return;
    }
    inFlight.current.add(key);
    const result = await api.directEdit(modId, key, target);
    inFlight.current.delete(key);
    if (result.ok) setOverrides((prev) => ({ ...prev, [key]: target }));
    setMessage(result.ok ? { kind: 'ok', text: s.saved(key) } : { kind: 'error', text: result.message });
  };

  const hits = useMemo(() => (loaded ? buildHits(loaded.modId, loaded.strings, overrides, query) : []), [loaded, overrides, query]);
  return { loaded, hits, query, setQuery, message, open, commit };
}
