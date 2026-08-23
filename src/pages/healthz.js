import { json } from '../lib/http.js';

export const prerender = false;

export function GET() {
  return json({ status: 'ok', service: 'open-artifacts', timestamp: new Date().toISOString() });
}
