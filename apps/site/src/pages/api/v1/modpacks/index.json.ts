import type { APIRoute } from 'astro';
import { getModpacks } from '../../../../lib/data';
import { byModpackName, toModpackSummary } from '../../../../lib/modpacks';

export const GET: APIRoute = async () => {
  const modpacks = (await getModpacks()).map(toModpackSummary).sort(byModpackName);
  const body = { version: 1, generatedAt: new Date().toISOString(), modpacks };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
