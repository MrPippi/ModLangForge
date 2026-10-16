import type { APIRoute, GetStaticPaths } from 'astro';
import { getCatalog, type SiteMod } from '../../../../lib/data';
import { toModApiBody } from '../../../../lib/modPayload';

export const getStaticPaths = (async () => {
  const catalog = await getCatalog();
  return catalog.map((mod) => ({ params: { modId: mod.meta.modId }, props: { mod } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ mod: SiteMod }> = ({ props }) =>
  new Response(JSON.stringify(toModApiBody(props.mod)), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
