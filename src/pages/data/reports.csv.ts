import type { APIRoute } from 'astro';
import { allReports, CSV_COLUMNS, dbConfigured } from '../../lib/db';

export const prerender = false;

function cell(v: unknown) {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The full dataset, CC BY 4.0. Cached at the edge for an hour.
export const GET: APIRoute = async () => {
  const rows = dbConfigured() ? await allReports() : [];
  const lines = [CSV_COLUMNS.join(','), ...rows.map((r) => CSV_COLUMNS.map((c) => cell(r[c])).join(','))];
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'inline; filename="hitmylimit-reports.csv"',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
