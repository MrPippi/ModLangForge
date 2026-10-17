import { create } from 'zustand';
import { MAX_JAR_BYTES, readJar } from '@mlf/core/jar';
import { buildProject, mergeProject, updateEntry } from '@mlf/core/merge';
import { kubejsProject, mergeKubejsProject, modpackProjectId, modpackRef } from '@mlf/core/modpack';
import type { ModpackPayload } from '../../islands/downloadModpack';
import { t } from '../i18n/zh-TW';
import type { DetectedMod, EntrySection, ModProject } from '@mlf/core';
import { jarErrorMessage } from './errorMessages';
import { clearAll, deleteProject, loadAll, saveProject } from './persistence';
import { toastError, toastInfo } from './toastStore';

export type ConflictAction = 'merge' | 'replace' | 'skip';

interface WorkspaceData {
  readonly mods: readonly ModProject[];
  readonly activeModId: string | null;
  readonly pendingConflicts: readonly DetectedMod[];
  readonly persistent: boolean;
  readonly loading: boolean;
}

interface WorkspaceActions {
  init: () => Promise<void>;
  addJars: (files: readonly File[]) => Promise<void>;
  resolveConflict: (modId: string, action: ConflictAction) => Promise<void>;
  /** 由網站整合包資料建立或合併 KubeJS 專案（每個命名空間一個） */
  addModpack: (pack: ModpackPayload) => Promise<void>;
  setActive: (id: string) => void;
  /** section 預設為語言檔；手冊條目傳 'guide' */
  editEntry: (modId: string, key: string, target: string, section?: EntrySection) => void;
  removeMod: (id: string) => Promise<void>;
  clearWorkspace: () => Promise<void>;
}

export type WorkspaceState = WorkspaceData & WorkspaceActions;

export const initialWorkspaceState: WorkspaceData = {
  mods: [],
  activeModId: null,
  pendingConflicts: [],
  persistent: true,
  loading: false,
};

/** 進行中的儲存；編輯只在 Enter／失焦時提交，因此每次提交立即寫入，不做 debounce */
const inFlightSaves = new Set<Promise<void>>();

async function readFile(file: File): Promise<DetectedMod[]> {
  if (file.size > MAX_JAR_BYTES) {
    toastError(t.errors.tooLarge(file.name));
    return [];
  }
  try {
    const detected = await readJar(new Uint8Array(await file.arrayBuffer()), file.name);
    for (const mod of detected) {
      for (const { book, reason } of mod.guide?.skipped ?? []) toastInfo(t.notices.guideSkipped(file.name, book, reason));
    }
    return detected;
  } catch (err) {
    if (import.meta.env.DEV) console.error('readJar failed', file.name, err);
    toastError(jarErrorMessage(file.name, err));
    return [];
  }
}

function replaceMod(mods: readonly ModProject[], next: ModProject): ModProject[] {
  const exists = mods.some((m) => m.id === next.id);
  return exists ? mods.map((m) => (m.id === next.id ? next : m)) : [...mods, next];
}

export const useWorkspace = create<WorkspaceState>()((set, get) => {
  async function persist(op: () => Promise<void>): Promise<void> {
    if (!get().persistent) return;
    try {
      await op();
    } catch (err) {
      if (import.meta.env.DEV) console.error('persist failed', err);
      set({ persistent: false });
      toastError(t.errors.saveFailed);
    }
  }

  function saveNow(id: string): void {
    const mod = get().mods.find((m) => m.id === id);
    if (!mod) return;
    const job = persist(() => saveProject(mod)).finally(() => inFlightSaves.delete(job));
    inFlightSaves.add(job);
  }

  return {
    ...initialWorkspaceState,

    init: async () => {
      set({ loading: true });
      try {
        const mods = await loadAll();
        const sorted = [...mods].sort((a, b) => a.name.localeCompare(b.name));
        set({ mods: sorted, activeModId: sorted[0]?.id ?? null, persistent: true });
      } catch (err) {
        if (import.meta.env.DEV) console.error('loadAll failed', err);
        set({ persistent: false });
      } finally {
        set({ loading: false });
      }
    },

    addJars: async (files) => {
      set({ loading: true });
      try {
        for (const file of files) {
          for (const detected of await readFile(file)) {
            const { mods, pendingConflicts, activeModId } = get();
            // jar 專案的 id 等於 modId；整合包專案的 id 是 modpack:<id>:<ns>，同名命名空間不算衝突
            if (mods.some((m) => m.id === detected.modId)) {
              set({ pendingConflicts: [...pendingConflicts, detected] });
              continue;
            }
            const project = buildProject(detected, Date.now());
            set({ mods: [...mods, project], activeModId: activeModId ?? project.id });
            await persist(() => saveProject(project));
          }
        }
      } finally {
        set({ loading: false });
      }
    },

    resolveConflict: async (modId, action) => {
      const { pendingConflicts, mods } = get();
      const conflict = pendingConflicts.find((c) => c.modId === modId);
      if (!conflict) return;
      const rest = pendingConflicts.filter((c) => c !== conflict);
      const existing = mods.find((m) => m.id === modId);
      if (action === 'skip' || !existing) {
        set({ pendingConflicts: rest });
        return;
      }
      const now = Date.now();
      const next = action === 'merge' ? mergeProject(existing, conflict, now) : buildProject(conflict, now);
      set({ pendingConflicts: rest, mods: replaceMod(mods, next) });
      await persist(() => saveProject(next));
    },

    addModpack: async (pack) => {
      const namespaces = Object.keys(pack.kubejs).sort();
      if (namespaces.length === 0) {
        toastInfo(t.modpack.noText(pack.meta.name));
        return;
      }
      const ref = modpackRef(pack.meta);
      const now = Date.now();
      const projects = namespaces.flatMap((ns) => {
        const texts = pack.kubejs[ns];
        if (!texts) return [];
        const existing = get().mods.find((m) => m.id === modpackProjectId(ref.id, ns));
        return [existing ? mergeKubejsProject(existing, ref, ns, texts, now) : kubejsProject(ref, ns, texts, now)];
      });
      set({
        mods: projects.reduce<readonly ModProject[]>(replaceMod, get().mods),
        activeModId: get().activeModId ?? projects[0]?.id ?? null,
      });
      for (const p of projects) await persist(() => saveProject(p));
      toastInfo(t.modpack.loaded(pack.meta.name, projects.length));
    },

    setActive: (id) => set({ activeModId: id }),

    editEntry: (modId, key, target, section = 'lang') => {
      const mod = get().mods.find((m) => m.id === modId);
      if (!mod) return;
      const next = updateEntry(mod, key, target, Date.now(), section);
      if (next === mod) return;
      set({ mods: replaceMod(get().mods, next) });
      saveNow(modId);
    },

    removeMod: async (id) => {
      const mods = get().mods.filter((m) => m.id !== id);
      const activeModId = get().activeModId === id ? (mods[0]?.id ?? null) : get().activeModId;
      set({ mods, activeModId });
      await persist(() => deleteProject(id));
    },

    clearWorkspace: async () => {
      set({ mods: [], activeModId: null, pendingConflicts: [] });
      await persist(clearAll);
    },
  };
});

/** 等待所有進行中的儲存完成（測試與關閉頁面前使用） */
export async function flushPendingSaves(): Promise<void> {
  await Promise.all([...inFlightSaves]);
}
