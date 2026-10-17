import { useEffect, useId, useState } from 'react';
import { fetchModpackData, type ModpackPayload } from '../../islands/downloadModpack';
import { modpackDisplayName } from '../../lib/modpackSummary';
import { t } from '../i18n/zh-TW';
import { fetchModpackIndex, type ModpackOption } from '../modpack/modpackIndex';
import { toastError } from '../store/toastStore';
import { useWorkspace } from '../store/workspaceStore';

interface ModpackLoaderProps {
  /** 必須是穩定參考；預設讀取 /api/v1/modpacks/index.json */
  readonly loadIndex?: () => Promise<readonly ModpackOption[]>;
  readonly loadModpack?: (id: string) => Promise<ModpackPayload>;
}

const defaultLoadIndex = (): Promise<ModpackOption[]> => fetchModpackIndex();
const defaultLoadModpack = (id: string): Promise<ModpackPayload> => fetchModpackData(id);

/** 「載入網站上的整合包」；沒有可翻的整合包或清單載入失敗時不顯示 */
export function ModpackLoader({ loadIndex = defaultLoadIndex, loadModpack = defaultLoadModpack }: ModpackLoaderProps) {
  const addModpack = useWorkspace((s) => s.addModpack);
  const [options, setOptions] = useState<readonly ModpackOption[]>([]);
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();

  useEffect(() => {
    let active = true;
    loadIndex().then(
      (list) => {
        if (active) setOptions(list);
      },
      (err: unknown) => console.error('[translator] 整合包清單載入失敗', err),
    );
    return () => {
      active = false;
    };
  }, [loadIndex]);

  if (options.length === 0) return null;
  const selected = options.some((o) => o.id === chosen) ? chosen : (options[0]?.id ?? '');

  const load = async () => {
    setBusy(true);
    try {
      await addModpack(await loadModpack(selected));
    } catch (err) {
      if (import.meta.env.DEV) console.error('load modpack failed', selected, err);
      toastError(t.modpack.loadFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2 rounded-sm border-2 border-line bg-surface p-3 text-sm">
      <h2 id={`${id}-title`} className="text-base font-semibold">{t.modpack.title}</h2>
      <p className="text-xs text-muted">{t.modpack.hint}</p>
      <label htmlFor={`${id}-select`} className="font-medium">{t.modpack.select}</label>
      <select id={`${id}-select`} className="input" value={selected} onChange={(e) => setChosen(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{modpackDisplayName(o)}</option>)}
      </select>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void load()}>
        {busy ? t.modpack.loading : t.modpack.load}
      </button>
    </section>
  );
}
