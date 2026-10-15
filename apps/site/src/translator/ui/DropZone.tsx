import { type DragEvent, useState } from 'react';
import { Icon } from '../../components/Icon';
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
      <label className="btn btn-secondary w-full cursor-pointer text-center focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        {loading ? t.dropzone.reading : <><Icon name="plus" />{t.dropzone.addMore}</>}
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
      className={`flex min-h-72 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-sm border-4 border-dashed bg-surface p-8 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${
        dragging ? 'border-primary bg-primary-soft' : 'border-line-strong hover:border-primary'
      }`}
    >
      <Icon name="box" size={56} className="text-link" />
      <span className="font-pixel text-[1.375rem]">{loading ? t.dropzone.reading : t.dropzone.hint}</span>
      <span className="text-sm text-muted">{t.dropzone.sub}</span>
      {input}
    </label>
  );
}
