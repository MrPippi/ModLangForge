import type { APIRoute, GetStaticPaths } from 'astro';
import { getModpacks } from '../../../../lib/data';
import { type SiteModpack, toModpackApiBody } from '../../../../lib/modpacks';

export const getStaticPaths = (async () => {
  const packs = await getModpacks();
  return packs.map((pack) => ({ params: { modpackId: pack.meta.id }, props: { pack } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ pack: SiteModpack }> = ({ props }) =>
  new Response(JSON.stringify(toModpackApiBody(props.pack)), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
