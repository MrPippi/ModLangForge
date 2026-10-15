import type { APIRoute } from 'astro';
import { robotsTxt } from '../lib/siteMeta';

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error('astro.config 未設定 site，無法產生 robots.txt');
  return new Response(robotsTxt(site), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
