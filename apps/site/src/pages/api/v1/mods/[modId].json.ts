import type { APIRoute, GetStaticPaths } from 'astro';
import { getCatalog, type SiteMod } from '../../../../lib/data';

export const getStaticPaths = (async () => {
  const catalog = await getCatalog();
  return catalog.map((mod) => ({ params: { modId: mod.meta.modId }, props: { mod } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ mod: SiteMod }> = ({ props }) => {
  const { meta, en, zh } = props.mod;
  const body = { version: 1, meta, en_us: en, zh_tw: zh };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
