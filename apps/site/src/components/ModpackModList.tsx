import { platformModUrl, type ModpackMod } from '@mlf/core/modpack';
import { t } from '../i18n/zh-TW';
import { modUrl } from '../lib/config';
import { type IncludedMod, modpackDisplayName } from '../lib/modpackSummary';
import { BuiltinTag } from './BuiltinTag';
import { Icon } from './Icon';

interface ModpackModListProps {
  readonly included: readonly IncludedMod[];
  readonly missing: readonly ModpackMod[];
}

/** 整合包頁的模組清單：已收錄者連到模組頁並顯示完成度，未收錄者顯示 slug 與平台連結 */
export function ModpackModList({ included, missing }: ModpackModListProps) {
  return (
    <div className="grid gap-6">
      <section aria-labelledby="included-title">
        <h3 id="included-title" className="mb-2 text-base">{t.modpackPage.includedTitle(included.length)}</h3>
        {included.length > 0 ? (
          <ul className="card divide-y-2 divide-line p-0">
            {included.map((m) => (
              <li key={m.modId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <a className="link font-medium" href={modUrl(m.modId)}>{modpackDisplayName(m)}</a>
                {m.builtin ? (
                  <BuiltinTag />
                ) : (
                  <span className="text-xs text-muted tabular-nums">{t.modpackPage.modPercent(m.percent)}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t.modpackPage.noneIncluded}</p>
        )}
      </section>
      {missing.length > 0 && (
        <section aria-labelledby="missing-title">
          <h3 id="missing-title" className="mb-1 text-base">{t.modpackPage.missingTitle(missing.length)}</h3>
          <p className="mb-2 text-sm text-muted">{t.modpackPage.missingNote}</p>
          <ul className="card divide-y-2 divide-line p-0">
            {missing.map((m) => (
              <li key={`${m.platform}:${m.projectId}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="font-mono text-sm break-all">{m.slug}</span>
                <a className="link inline-flex min-h-11 items-center gap-1 text-sm" href={platformModUrl(m)} rel="noopener noreferrer" target="_blank">
                  {t.modpackPage.platforms[m.platform]}
                  <Icon name="external" size={10} />
                  <span className="sr-only">{t.common.newWindow}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
