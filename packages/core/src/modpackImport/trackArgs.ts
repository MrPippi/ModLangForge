import { ModpackImportError } from './errors';

export const TRACK_MODPACKS_USAGE = '用法：npm run track:modpacks -- [--summary <摘要檔路徑>]';
const SUMMARY_FLAG = '--summary';

export interface TrackModpacksArgs {
  readonly summary?: string;
}

function withPath(path: string): TrackModpacksArgs {
  if (path.trim() === '' || path.startsWith('--')) throw new ModpackImportError(TRACK_MODPACKS_USAGE);
  return { summary: path };
}

/** 只接受沒有參數，或一個 --summary <路徑>／--summary=<路徑> */
export function parseTrackModpacksArgs(argv: readonly string[]): TrackModpacksArgs {
  if (argv.length === 0) return {};
  const [flag = '', value, ...rest] = argv;
  if (argv.length === 1 && flag.startsWith(`${SUMMARY_FLAG}=`)) return withPath(flag.slice(SUMMARY_FLAG.length + 1));
  if (flag === SUMMARY_FLAG && value !== undefined && rest.length === 0) return withPath(value);
  throw new ModpackImportError(TRACK_MODPACKS_USAGE);
}
