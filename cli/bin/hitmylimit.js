#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { claudeDirs, claudeHits, readClaude } from '../src/claude.js';
import { codexDirs, codexHits, readCodex } from '../src/codex.js';
import { ACCOUNTS, PLANS, PRODUCT_NAMES, WINDOW_NAMES, WORK } from '../src/options.js';
import { buildReport, comparisonLine, send } from '../src/report.js';
import { hitKey, loadState, saveState, statePath } from '../src/state.js';
import { DAY, duration, isoDay } from '../src/time.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `Usage: npx hitmylimit [options]

Finds the times you hit a usage limit in your local Claude Code and Codex logs,
shows the report it would send, and sends it to hitmylimit.com if you agree.

Options:
  --days <n>        How far back to look (default 30)
  --plan <plan>     Your plan, e.g. pro, max-5x, max-20x, plus, pro-200
  --work <kind>     coding, chat, research or other (default coding)
  --account <type>  own, shared or reseller (default own)
  --pick <n>        Which limit hit to share, as numbered in the list (default 1)
  --yes             Send without asking (still prints the report)
  --dry-run         Print the report and stop
  --api <url>       Send to another server (default https://hitmylimit.com/api/reports)
  -h, --help        Show this help
  -v, --version     Show the version

It reads only ~/.claude/projects and ~/.codex/sessions. It never reads login
or credential files and never contacts Anthropic or OpenAI.
`;

const tokens = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

async function main() {
  const { values: o } = parseArgs({
    options: {
      days: { type: 'string', default: '30' },
      plan: { type: 'string' },
      work: { type: 'string' },
      account: { type: 'string' },
      pick: { type: 'string' },
      yes: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      api: { type: 'string', default: process.env.HITMYLIMIT_API || 'https://hitmylimit.com/api/reports' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (o.help) return console.log(HELP);
  if (o.version) return console.log(version);

  const days = Math.max(1, Math.min(60, Number(o.days) || 30));
  const since = Date.now() - days * DAY;
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !o.yes;
  const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;

  const ask = async (question, choices, fallback, preset) => {
    if (preset !== undefined) {
      if (choices.some(([k]) => k === preset)) return preset;
      throw new Error(`"${preset}" is not one of: ${choices.map(([k]) => k).join(', ')}`);
    }
    const def = Math.max(1, choices.findIndex(([k]) => k === fallback) + 1);
    if (!rl) return choices[def - 1][0];
    console.log(`\n${question}`);
    choices.forEach(([, label], i) => console.log(`  ${String(i + 1).padStart(2)}  ${label}`));
    for (;;) {
      const a = (await rl.question(`[${def}]: `)).trim();
      const n = a === '' ? def : Number(a);
      if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1][0];
    }
  };

  try {
    console.log(`hitmylimit ${version}`);
    console.log(`Reading Claude Code and Codex logs from the last ${days} days...`);
    const [claude, codex] = await Promise.all([readClaude(claudeDirs(), since), readCodex(codexDirs(), since)]);
    const statePathname = statePath();
    const state = await loadState(statePathname);
    const found = [...claudeHits(claude), ...codexHits(codex)].sort((a, b) => b.hit - a.hit);

    if (!found.length) {
      const seen = [claude.usage.length && 'Claude Code', codex.usage.length && 'Codex'].filter(Boolean);
      console.log(
        seen.length
          ? `\nNo limit hits found in your ${seen.join(' and ')} logs from the last ${days} days.`
          : '\nNo Claude Code or Codex logs found on this computer.',
      );
      console.log('You can still share a limit hit by hand at https://hitmylimit.com/share');
      return;
    }

    console.log(`\nLimit hits found:`);
    found.forEach((c, i) => {
      const cols = [
        String(i + 1).padStart(3),
        isoDay(new Date(c.hit)),
        PRODUCT_NAMES[c.product].padEnd(11),
        WINDOW_NAMES[c.window].padEnd(7),
        `${duration((c.hit - c.start) / 60000)} into the window`.padEnd(26),
        c.tokens ? `${tokens(c.tokens.total)} tokens`.padEnd(14) : ''.padEnd(14),
        state.sent.includes(hitKey(c)) ? '(already sent)' : '',
      ];
      console.log(cols.join('  ').trimEnd());
    });

    const firstUnsent = Math.max(0, found.findIndex((c) => !state.sent.includes(hitKey(c))));
    let pick = o.pick !== undefined ? Number(o.pick) : firstUnsent + 1;
    if (rl && o.pick === undefined) {
      for (;;) {
        const a = (await rl.question(`\nWhich one do you want to share? [${pick}]: `)).trim();
        const n = a === '' ? pick : Number(a);
        if (Number.isInteger(n) && n >= 1 && n <= found.length) {
          pick = n;
          break;
        }
      }
    }
    const c = found[pick - 1];
    if (!c) throw new Error(`--pick must be between 1 and ${found.length}`);
    if (!rl && o.pick === undefined && state.sent.includes(hitKey(c))) {
      return console.log('\nAll of these were already sent. Use --pick to send one again.');
    }

    // The plan logged at the time of the hit wins. Otherwise the last answer is only a suggestion, since people
    // change plans; without a prompt to confirm it, --plan is required.
    if (!rl && !o.plan && !c.plan) throw new Error('Pass --plan with the plan you were on when you hit the limit');
    const suggested = c.plan ?? state.plans[c.lab] ?? undefined;
    const plan = await ask(
      `Your ${c.lab === 'anthropic' ? 'Claude' : 'ChatGPT'} plan on ${isoDay(new Date(c.hit))}, when you hit the limit:`,
      PLANS[c.lab],
      suggested,
      o.plan,
    );
    const work = await ask('Kind of work:', WORK, 'coding', o.work);
    const account = await ask('Account:', ACCOUNTS, 'own', o.account);

    const report = buildReport(c, { plan, work, account, clientId: state.client_id });
    console.log('\nThis is everything that will be sent:\n');
    console.log(JSON.stringify(report, null, 2));
    console.log('\nclient_id is a random id made on this computer. It is hashed before it is stored.');

    if (o['dry-run']) return console.log('\nDry run: nothing was sent.');
    if (rl) {
      const a = (await rl.question('\nSend it? [y/N]: ')).trim().toLowerCase();
      if (a !== 'y' && a !== 'yes') return console.log('Nothing was sent.');
    }

    const result = await send(o.api, report);
    state.plans[c.lab] = plan;
    if (!state.sent.includes(hitKey(c))) state.sent.push(hitKey(c));
    await saveState(statePathname, state);
    console.log(`\n${result.duplicate ? 'This report was already sent.' : 'Sent. Thank you.'} ${comparisonLine(result.comparison)}`);
    console.log('Results by plan: https://hitmylimit.com/limits');
  } finally {
    rl?.close();
  }
}

main().catch((e) => {
  console.error(`\nhitmylimit: ${e.message}`);
  process.exit(1);
});
