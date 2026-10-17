import type { APIRoute } from 'astro';
import { getAllSummaries } from '../../../lib/data';

export const API_VERSION = 1;

export const GET: APIRoute = async () => {
  const mods = await getAllSummaries();
  const body = { version: API_VERSION, generatedAt: new Date().toISOString(), mods };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
