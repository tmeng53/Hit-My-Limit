import type { APIRoute } from 'astro';
import { allowSubmit, compare, dbConfigured, saveReport } from '../../lib/db';
import { parseReport } from '../../lib/reports';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!dbConfigured()) return json(503, { error: 'Reports are not open yet' });
  if (Number(request.headers.get('content-length') ?? 0) > 4096) return json(413, { error: 'Report too large' });

  let report;
  try {
    report = parseReport(await request.json());
  } catch (e) {
    return json(400, { error: e instanceof Error ? e.message : 'Invalid report' });
  }

  const ip = request.headers.get('x-real-ip') || clientAddress || 'unknown';
  if (!(await allowSubmit(ip))) return json(429, { error: 'Too many reports from this address today' });

  const saved = await saveReport(report);
  const comparison = await compare(report);
  return json(saved ? 201 : 200, { saved, duplicate: !saved, minutes_to_limit: report.minutes_to_limit, comparison });
};
