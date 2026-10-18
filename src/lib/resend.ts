// The alert list lives in Resend, one segment per language. Alerts go out as Resend broadcasts, and Resend
// handles unsubscribing. The segment ids aren't secret; the API key (RESEND_API_KEY) is.
const KEY = process.env.RESEND_API_KEY || '';
const API = 'https://api.resend.com';
export const SEGMENTS = {
  en: '1fa0f83e-2d52-4970-81a0-673ea9bd121b',
  zh: '728d652e-6619-48cc-b3d3-a15c74c1020d',
} as const;

export function resendConfigured() {
  return KEY !== '';
}

// Adds the address to the segment for its language and takes it out of the other one, so a person who signs up
// again on the other language's page gets alerts in that language only. Signing up again also re-subscribes.
export async function addToList(email: string, lang: 'en' | 'zh'): Promise<void> {
  const headers = { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
  const res = await fetch(`${API}/contacts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, unsubscribed: false, segments: [{ id: SEGMENTS[lang] }] }),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}`);
  const other = SEGMENTS[lang === 'en' ? 'zh' : 'en'];
  await fetch(`${API}/contacts/${encodeURIComponent(email)}/segments/${other}`, { method: 'DELETE', headers }).catch(() => {});
}
