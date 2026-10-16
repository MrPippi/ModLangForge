import { avatarUrl } from '../lib/config';

interface Props {
  readonly uuid: string | null;
  readonly name: string;
  readonly size?: number;
}

/** 有 UUID 時顯示 Minecraft 頭像，否則顯示名稱首字；裝飾用，名稱另以文字呈現 */
export function Avatar({ uuid, name, size = 32 }: Props) {
  if (!uuid) {
    return (
      <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-sm bg-surface-2 font-bold text-muted" style={{ width: size, height: size }}>
        {[...name][0] ?? '?'}
      </span>
    );
  }
  return <img src={avatarUrl(uuid, size)} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" className="shrink-0 rounded-sm [image-rendering:pixelated]" />;
}
