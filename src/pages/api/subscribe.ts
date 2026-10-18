import type { APIRoute } from 'astro';
import { allowSubmit, dbConfigured, subscribe } from '../../lib/db';
import { parseEmail } from '../../lib/email';
import { addToList, resendConfigured } from '../../lib/resend';

export const prerender = false;

const SIGNUPS_PER_IP_PER_DAY = 5;

// Takes a form post from the change log page. With JavaScript the page reads the JSON reply; without it the
// browser is sent back to the page, which shows the result from the query string.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const form = await request.formData().catch(() => null);
  const lang = form?.get('lang') === 'zh' ? 'zh' : 'en';
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const reply = (status: number, result: 'ok' | 'invalid' | 'error') =>
    wantsJson
      ? new Response(JSON.stringify({ result }), { status, headers: { 'content-type': 'application/json' } })
      : Response.redirect(new URL(`${lang === 'zh' ? '/zh' : ''}/changes?signup=${result}`, request.url), 303);

  const email = parseEmail(form?.get('email'));
  if (!email) return reply(400, 'invalid');
  // Bots fill in every field, including this hidden one.
  if (form?.get('website')) return reply(200, 'ok');
  if (!dbConfigured()) return reply(503, 'error');

  try {
    const ip = request.headers.get('x-real-ip') || clientAddress || 'unknown';
    if (!(await allowSubmit(ip, 'signup:', SIGNUPS_PER_IP_PER_DAY))) return reply(429, 'error');
    await subscribe(email, lang);
    if (resendConfigured()) await addToList(email, lang);
  } catch {
    return reply(500, 'error');
  }
  return reply(200, 'ok');
};
