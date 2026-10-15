import type { APIRoute } from 'astro';
import { getGlossary } from '../../../lib/data';

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await getGlossary()), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
