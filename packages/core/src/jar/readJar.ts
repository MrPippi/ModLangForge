import JSZip from 'jszip';
import type { DetectedMod, LangFormat } from '../types';
import { LangParseError, parseLangText } from '../lang';
import { JarError, MAX_JAR_BYTES, MAX_UNCOMPRESSED_BYTES } from './errors';
import { findLangFiles, type LangFileRef } from './findLangFiles';
import { type ModMeta, readModMetadata } from './metadata';

type Locale = 'en_us' | 'zh_tw' | 'zh_cn';
const LOCALES: readonly Locale[] = ['en_us', 'zh_tw', 'zh_cn'];

interface ReadContext {
  readonly zip: JSZip;
  readonly jarName: string;
  totalBytes: number;
}

async function loadZip(data: Uint8Array, jarName: string): Promise<JSZip> {
  if (data.byteLength > MAX_JAR_BYTES) {
    throw new JarError('too-large', `${jarName} exceeds ${MAX_JAR_BYTES} bytes`);
  }
  try {
    return await JSZip.loadAsync(data);
  } catch (err) {
    throw new JarError('not-zip', err instanceof Error ? err.message : String(err));
  }
}

async function readLang(ctx: ReadContext, ref: LangFileRef): Promise<{ entries: Record<string, string>; order: string[] }> {
  const file = ctx.zip.file(ref.path);
  if (!file) throw new JarError('parse', 'file vanished', ref.path);
  const text = await file.async('string');
  ctx.totalBytes += text.length;
  if (ctx.totalBytes > MAX_UNCOMPRESSED_BYTES) {
    throw new JarError('too-large', `${ctx.jarName} uncompressed content too large`);
  }
  try {
    const parsed = parseLangText(text, ref.format);
    return { entries: { ...parsed.entries }, order: [...parsed.order] };
  } catch (err) {
    const reason = err instanceof LangParseError ? err.message : String(err);
    throw new JarError('parse', reason, ref.path);
  }
}

function pickRef(refs: readonly LangFileRef[], locale: Locale, format: LangFormat): LangFileRef | undefined {
  return refs.find((r) => r.locale === locale && r.format === format) ?? refs.find((r) => r.locale === locale);
}

async function buildDetected(ctx: ReadContext, namespace: string, refs: readonly LangFileRef[], meta: readonly ModMeta[]): Promise<DetectedMod | null> {
  const enRefs = refs.filter((r) => r.locale === 'en_us');
  if (enRefs.length === 0) return null;
  const format: LangFormat = enRefs.some((r) => r.format === 'json') ? 'json' : 'lang';
  const [en, tw, cn] = await Promise.all(
    LOCALES.map((loc) => {
      const ref = pickRef(refs, loc, format);
      return ref ? readLang(ctx, ref) : Promise.resolve(undefined);
    }),
  );
  if (!en) return null;
  const info = meta.find((m) => m.modId === namespace);
  return {
    modId: namespace,
    name: info?.name ?? namespace,
    version: info?.version ?? 'unknown',
    jarName: ctx.jarName,
    format,
    source: en.entries,
    order: en.order,
    ...(tw ? { zhTw: tw.entries } : {}),
    ...(cn ? { zhCn: cn.entries } : {}),
  };
}

/** 讀取 jar，回傳其中每個含 en_us 語言檔的命名空間 */
export async function readJar(data: Uint8Array, jarName: string): Promise<DetectedMod[]> {
  const zip = await loadZip(data, jarName);
  const paths = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name);
  const refs = findLangFiles(paths);
  const namespaces = [...new Set(refs.map((r) => r.namespace))];
  const meta = await readModMetadata(zip);
  const ctx: ReadContext = { zip, jarName, totalBytes: 0 };
  const mods: DetectedMod[] = [];
  for (const ns of namespaces) {
    const mod = await buildDetected(ctx, ns, refs.filter((r) => r.namespace === ns), meta);
    if (mod) mods.push(mod);
  }
  if (mods.length === 0) throw new JarError('no-lang', `${jarName} has no en_us lang file`);
  return mods;
}
