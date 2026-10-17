import { isoDay } from './time.js';

// The exact body sent to the site. Nothing else leaves the computer.
export function buildReport(c, { plan, work, account, felt = null, clientId }) {
  return {
    lab: c.lab,
    product: c.product,
    plan,
    window: c.window,
    minutes_to_limit: Math.max(5, Math.round((c.hit - c.start) / 300_000) * 5),
    hit_on: isoDay(new Date(c.hit)),
    model: c.model,
    work,
    account,
    felt,
    tokens: c.tokens,
    tool_version: c.tool_version,
    source: 'cli',
    client_id: clientId,
  };
}

export async function send(api, report) {
  const res = await fetch(api, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'hitmylimit-cli' },
    body: JSON.stringify(report),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

export function comparisonLine(c) {
  if (!c) return '';
  if (c.percent === null) return `There are ${c.n} recent reports on this plan so far. A comparison shows up once there are 20.`;
  return `You hit the limit sooner than ${c.percent}% of ${c.n} recent reports on the same plan${c.sameWork ? ' doing the same kind of work' : ''}.`;
}
