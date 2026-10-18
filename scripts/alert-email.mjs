// Builds the alert email for one change log entry. Used by send-alert.mjs.
const SITE = 'https://hitmylimit.com';

const TEXT = {
  en: { source: 'Source', all: 'All changes', unsub: 'Unsubscribe' },
  zh: { source: '来源', all: '全部变化', unsub: '退订' },
};

// Reads the frontmatter of an entry file. Values are plain or JSON-quoted strings, or [] lists.
export function parseEntry(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error('No frontmatter');
  const data = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    const value = line.slice(i + 1).trim();
    data[line.slice(0, i).trim()] = value.startsWith('"') || value.startsWith('[') ? JSON.parse(value) : value;
  }
  return data;
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildEmail(id, entry, lang, token) {
  const t = TEXT[lang];
  const title = (lang === 'zh' && entry.title_zh) || entry.title;
  const summary = (lang === 'zh' && entry.summary_zh) || entry.summary;
  const link = `${SITE}${lang === 'zh' ? '/zh' : ''}/changes#${id}`;
  const unsub = `${SITE}/unsubscribe?t=${encodeURIComponent(token)}`;
  const text = [
    title, '', summary, '', `${t.source}: ${entry.source_name} ${entry.source_url}`, `${t.all}: ${link}`, '', `${t.unsub}: ${unsub}`,
  ].join('\n');
  const html = `<div style="font-family:ui-monospace,Menlo,monospace;font-size:14px;line-height:1.5;max-width:560px">
<p style="font-weight:600">${escape(title)}</p>
<p>${escape(summary)}</p>
<p>${t.source}: <a href="${escape(entry.source_url)}">${escape(entry.source_name)}</a><br><a href="${escape(link)}">${t.all}</a></p>
<p style="color:#888;font-size:12px"><a href="${escape(unsub)}" style="color:#888">${t.unsub}</a></p>
</div>`;
  return {
    subject: title,
    text,
    html,
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
