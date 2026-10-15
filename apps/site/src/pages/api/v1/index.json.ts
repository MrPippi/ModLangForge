import type { APIRoute } from 'astro';
import { getCatalog, toSummary } from '../../../lib/data';

export const API_VERSION = 1;

export const GET: APIRoute = async () => {
  const mods = (await getCatalog()).map(toSummary);
  const body = { version: API_VERSION, generatedAt: new Date().toISOString(), mods };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
