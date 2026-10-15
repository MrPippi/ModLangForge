import { type DragEvent, useState } from 'react';
import { t } from '../i18n/zh-TW';
import { useWorkspace } from '../store/workspaceStore';

const ACCEPT = '.jar,.zip';

interface DropZoneProps {
  readonly compact?: boolean;
}

export function DropZone({ compact = false }: DropZoneProps) {
  const addJars = useWorkspace((s) => s.addJars);
  const loading = useWorkspace((s) => s.loading);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (files.length > 0) void addJars(files);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const input = (
    <input
      type="file"
      multiple
      accept={ACCEPT}
      aria-label={t.dropzone.hint}
      className="sr-only"
      onChange={(e) => {
        handleFiles(e.target.files);
        e.target.value = '';
      }}
    />
  );

  if (compact) {
    return (
      <label className="btn btn-secondary w-full cursor-pointer text-center">
        {loading ? t.dropzone.reading : `＋ ${t.dropzone.addMore}`}
        {input}
      </label>
    );
  }

  return (
    <label
      data-testid="dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex h-72 w-full max-w-2xl cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
        dragging ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950' : 'border-slate-300 hover:border-emerald-400 dark:border-slate-600'
      }`}
    >
      <span className="text-5xl" aria-hidden>📦</span>
      <span className="text-lg font-medium">{loading ? t.dropzone.reading : t.dropzone.hint}</span>
      <span className="text-sm text-slate-500">{t.dropzone.sub}</span>
      {input}
    </label>
  );
}
