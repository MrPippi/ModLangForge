import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import {
  faArrowRight, faArrowUpRightFromSquare, faBoxOpen, faBug, faCheck, faDownload, faMagnifyingGlass,
  faMoon, faPenToSquare, faPlus, faSun, faUpload, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { faGithub } from '@fortawesome/free-brands-svg-icons';

/** 站內用到的 Font Awesome Free icon（CC BY 4.0）；只匯入需要的圖示以便 tree-shaking */
const ICONS = {
  download: faDownload,
  upload: faUpload,
  plus: faPlus,
  check: faCheck,
  close: faXmark,
  edit: faPenToSquare,
  bug: faBug,
  box: faBoxOpen,
  search: faMagnifyingGlass,
  arrowRight: faArrowRight,
  external: faArrowUpRightFromSquare,
  sun: faSun,
  moon: faMoon,
  github: faGithub,
} as const satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  readonly name: IconName;
  /** 高度（px），寬度依圖示比例 */
  readonly size?: number;
  readonly className?: string;
}

/**
 * 直接以 SVG 輸出 icon，不依賴 Font Awesome 的 runtime 與 CSS，SSR 與 island 皆可用。
 * 一律 aria-hidden；需要語意時由外層提供文字。
 */
export function Icon({ name, size = 16, className = '' }: IconProps) {
  const [width, height, , , path] = ICONS[name].icon;
  const paths = Array.isArray(path) ? path : [path];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      height={size}
      width={(size * width) / height}
      viewBox={`0 0 ${width} ${height}`}
      className={`shrink-0 fill-current ${className}`}
    >
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
