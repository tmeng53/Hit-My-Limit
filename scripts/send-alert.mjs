// Emails one change log entry to everyone on the alert list, in their language, through Resend.
//   node scripts/send-alert.mjs src/content/changes/<entry>.md          dry run: prints counts and the English email
//   node scripts/send-alert.mjs src/content/changes/<entry>.md --send   sends it
//   ... --send --to me@example.com   sends only to that address, as a test; the entry can still be sent for real
// Needs DATABASE_URL; --send also needs RESEND_API_KEY and MAIL_FROM (e.g. "hitmylimit <alerts@hitmylimit.com>").
// An entry is only ever sent once.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import pg from 'pg';
import { buildEmail, parseEntry } from './alert-email.mjs';

const file = process.argv[2];
const send = process.argv.includes('--send');
const toIndex = process.argv.indexOf('--to');
const testTo = toIndex > 0 ? process.argv[toIndex + 1] : '';
if (!file) throw new Error('Usage: send-alert.mjs <entry.md> [--send]');
const id = basename(file, '.md');
const entry = parseEntry(readFileSync(file, 'utf8'));

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query(`create table if not exists alerts_sent (
    entry text primary key, recipients integer not null, sent_at timestamptz not null default now())`);
  const { rows: sent } = await db.query('select sent_at from alerts_sent where entry = $1', [id]);
  if (sent.length && !testTo) {
    console.log(`${id} was already sent on ${sent[0].sent_at.toISOString()}`);
    process.exit(0);
  }
  const { rows: table } = await db.query(`select to_regclass('subscribers') as t`);
  const { rows: people } = testTo
    ? { rows: [{ email: testTo, lang: 'en', token: 'test' }, { email: testTo, lang: 'zh', token: 'test' }] }
    : table[0].t
    ? await db.query('select email, lang, token from subscribers where unsubscribed_at is null order by created_at')
    : { rows: [] };
  const en = people.filter((p) => p.lang !== 'zh').length;
  console.log(`${id}: ${people.length} subscribers (${en} English, ${people.length - en} Chinese)`);

  if (!send) {
    const preview = buildEmail(id, entry, 'en', 'TOKEN');
    console.log(`\nSubject: ${preview.subject}\n\n${preview.text}\n\nDry run. Add --send to send.`);
  } else if (people.length) {
    const from = process.env.MAIL_FROM;
    if (!process.env.RESEND_API_KEY || !from) throw new Error('RESEND_API_KEY and MAIL_FROM are needed to send');
    // Resend takes up to 100 emails per batch call. Each person gets their own email, so no one sees other addresses.
    for (let i = 0; i < people.length; i += 100) {
      const batch = people.slice(i, i + 100).map((p) => ({ from, to: [p.email], ...buildEmail(id, entry, p.lang === 'zh' ? 'zh' : 'en', p.token) }));
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error(`Resend returned ${res.status} after ${i} emails: ${await res.text()}`);
    }
    if (!testTo) await db.query('insert into alerts_sent (entry, recipients) values ($1, $2)', [id, people.length]);
    console.log(`Sent to ${people.length}.`);
  }
} finally {
  await db.end();
}
