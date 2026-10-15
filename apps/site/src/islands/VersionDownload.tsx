import { type ReactNode, useId } from 'react';
import { t } from '../i18n/zh-TW';

interface VersionDownloadProps {
  readonly versions: readonly string[];
  readonly version: string;
  readonly disabled: boolean;
  readonly onVersionChange: (version: string) => void;
  readonly onDownload: () => void;
  /** 下載按鈕內容 */
  readonly children: ReactNode;
}

/** 版本選單與下載按鈕接成一個控制項：版本只影響下載，視覺上也綁在一起 */
export function VersionDownload({ versions, version, disabled, onVersionChange, onDownload, children }: VersionDownloadProps) {
  const id = useId();
  return (
    <div className="flex w-full flex-col gap-1 text-sm sm:w-auto">
      <label htmlFor={id} className="font-medium text-muted">{t.download.version}</label>
      <div className="dl-group">
        <select id={id} className="dl-group-select" value={version} onChange={(e) => onVersionChange(e.target.value)}>
          {versions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <button type="button" className="btn btn-primary dl-group-button" disabled={disabled} onClick={onDownload}>
          {children}
        </button>
      </div>
    </div>
  );
}
