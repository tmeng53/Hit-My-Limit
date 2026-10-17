// Turns a "Suggest a limit change" issue into a draft entry under src/content/changes.
// Reads ISSUE_BODY and ISSUE_NUMBER; writes outputs for the workflow to GITHUB_OUTPUT.
import { appendFileSync, writeFileSync } from 'node:fs';

const OFFICIAL = [
  'anthropic.com', 'claude.com', 'claude.ai', 'openai.com', 'chatgpt.com',
  'google.com', 'blog.google', 'googleblog.com', 'github.com/anthropics', 'github.com/openai',
  'github.com/google-gemini', 'techcrunch.com', 'theverge.com', 'arstechnica.com',
  'theinformation.com', 'wired.com', 'reuters.com', 'bloomberg.com',
];
const LABS = { anthropic: 'anthropic', openai: 'openai', google: 'google' };
// Where each lab speaks for itself. A free reset sourced here skips review, since resets only matter for a few hours.
const LAB_OWNED = {
  anthropic: ['anthropic.com', 'claude.com', 'claude.ai', 'github.com/anthropics', 'x.com/anthropicai', 'x.com/claudeai'],
  openai: ['openai.com', 'chatgpt.com', 'github.com/openai', 'x.com/openai', 'x.com/openaidevs', 'x.com/chatgptapp'],
  google: ['blog.google', 'gemini.google.com', 'ai.google.dev', 'github.com/google-gemini', 'x.com/googleai', 'x.com/geminiapp'],
};
const KINDS = { 'Usage limit changed': 'limit', 'How usage is displayed changed': 'display', 'Free limit reset': 'reset' };
const DIRECTIONS = { Tighter: 'tighter', Looser: 'looser', Mixed: 'mixed', 'Display only': 'neutral' };

function parseIssueForm(body) {
  const fields = {};
  for (const part of body.split(/^### /m).slice(1)) {
    const [label, ...rest] = part.split('\n');
    const value = rest.join('\n').trim();
    fields[label.trim()] = value === '_No response_' ? '' : value;
  }
  return fields;
}

function yamlString(s) {
  return JSON.stringify(s.replace(/\s+/g, ' ').trim());
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'change';
}

async function checkSource(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'hitmylimit-bot' } });
    return res.status < 400;
  } catch {
    return false;
  }
}

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}<<EOF\n${value}\nEOF\n`);
  else console.log(`${key}: ${value}`);
}

const f = parseIssueForm(process.env.ISSUE_BODY ?? '');
const problems = [];
const lab = LABS[(f['Lab'] ?? '').toLowerCase()];
if (!lab) problems.push('Lab must be Anthropic, OpenAI or Google.');
const date = f['Date of the change'] ?? '';
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) problems.push('Date must look like 2026-10-10.');
let source;
try {
  source = new URL(f['Source link'] ?? '');
  if (!/^https?:$/.test(source.protocol)) throw new Error();
} catch {
  problems.push('Source link must be a full http(s) URL.');
}
for (const key of ['Product', 'What changed, in one line', 'Details']) {
  if (!f[key]) problems.push(`"${key}" is empty.`);
}
if ((f['What changed, in one line'] ?? '').length > 90) problems.push('"What changed, in one line" must be 90 characters or fewer.');

if (problems.length) {
  output('ok', 'false');
  output('problems', problems.map((p) => `- ${p}`).join('\n'));
  process.exit(0);
}

const reachable = await checkSource(source.href);
const host = source.hostname.replace(/^www\./, '');
const official = OFFICIAL.some((d) => (host + source.pathname).startsWith(d) || host.endsWith('.' + d) || host === d);
const status = reachable && official ? 'confirmed' : 'unconfirmed';
const kind = KINDS[f['Kind of change']] ?? 'limit';
// Matches "domain" or "domain/first-path-segment", case-insensitive. twitter.com counts as x.com.
const xHost = host.replace(/^(mobile\.)?(twitter|x)\.com$/, 'x.com');
const firstSegment = (source.pathname.split('/')[1] ?? '').toLowerCase();
const labOwned = LAB_OWNED[lab].some((d) => {
  const [domain, segment] = d.split('/');
  return (xHost === domain || xHost.endsWith('.' + domain)) && (!segment || firstSegment === segment);
});
// X doesn't serve posts to bots, so the link check only counts for other sites.
const fast = kind === 'reset' && labOwned && (reachable || xHost === 'x.com');
const title = f['What changed, in one line'];
const plans = (f['Plans affected'] ?? '').split(',').map((p) => p.trim()).filter(Boolean);
const file = `src/content/changes/${date}-${lab}-${slugify(title)}.md`;

writeFileSync(file, `---
date: ${date}
date_kind: reported
lab: ${lab}
product: ${yamlString(f['Product'])}
plans: [${plans.map(yamlString).join(', ')}]
kind: ${kind}
direction: ${kind === 'reset' ? 'looser' : DIRECTIONS[f['Did limits get tighter or looser?']] ?? 'mixed'}
title: ${yamlString(title)}
summary: ${yamlString(f['Details'])}
source_url: ${yamlString(source.href)}
source_name: ${yamlString(host)}
status: ${status}
# Submitted in issue #${process.env.ISSUE_NUMBER}. Add title_zh and summary_zh before merging if you can.
---
`);

output('ok', 'true');
output('file', file);
output('title', title);
output('labels', kind === 'reset' ? 'submission,reset' : 'submission');
output('fast', String(fast));
output('notes', [
  reachable ? '- Source link loads.' : '- Source link did not load. Check it before approving.',
  official ? '- Source is an official or press site.' : '- Source is not on the official or press list, so the entry is marked unconfirmed.',
  ...(fast ? ["- Free reset sourced from the lab's own channel, so it was merged without review. Revert this PR if it's wrong."] : []),
].join('\n'));
