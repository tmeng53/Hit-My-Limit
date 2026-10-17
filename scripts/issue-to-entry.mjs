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

if (problems.length) {
  output('ok', 'false');
  output('problems', problems.map((p) => `- ${p}`).join('\n'));
  process.exit(0);
}

const reachable = await checkSource(source.href);
const host = source.hostname.replace(/^www\./, '');
const official = OFFICIAL.some((d) => (host + source.pathname).startsWith(d) || host.endsWith('.' + d) || host === d);
const status = reachable && official ? 'confirmed' : 'unconfirmed';
const title = f['What changed, in one line'];
const plans = (f['Plans affected'] ?? '').split(',').map((p) => p.trim()).filter(Boolean);
const file = `src/content/changes/${date}-${lab}-${slugify(title)}.md`;

writeFileSync(file, `---
date: ${date}
date_kind: reported
lab: ${lab}
product: ${yamlString(f['Product'])}
plans: [${plans.map(yamlString).join(', ')}]
kind: ${f['Kind of change'].startsWith('How usage') ? 'display' : 'limit'}
direction: ${DIRECTIONS[f['Did limits get tighter or looser?']] ?? 'mixed'}
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
output('notes', [
  reachable ? '- Source link loads.' : '- Source link did not load. Check it before approving.',
  official ? '- Source is an official or press site.' : '- Source is not on the official or press list, so the entry is marked unconfirmed.',
].join('\n'));
