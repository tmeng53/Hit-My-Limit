#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { claudeDirs, claudeHits, readClaude } from '../src/claude.js';
import { codexDirs, codexHits, readCodex } from '../src/codex.js';
import { ACCOUNTS, FELT, PLANS, WORK } from '../src/options.js';
import { buildReport, comparisonLine, send } from '../src/report.js';
import { select } from '../src/select.js';
import { hitKey, loadState, saveState, statePath } from '../src/state.js';
import { status } from '../src/status.js';
import { colors, hitLines, unreadNote } from '../src/display.js';
import { DAY } from '../src/time.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `Usage: npx hitmylimit [options]
       npx hitmylimit status [--json]

Finds the times you hit a usage limit in your local Claude Code and Codex logs,
shows the reports it would send, and sends them to hitmylimit.com if you agree.

Options:
  --days <n>        How far back to look (default 30)
  --plan <plan>     Your plan, e.g. pro, max-5x, max-20x, plus, pro-200 (used where the logs
                    have no plan). Per lab: --plan anthropic=max-5x --plan openai=pro-200
  --work <kind>     coding, chat, research or other (default coding)
  --account <type>  own, shared or reseller (default own)
  --felt <answer>   Compared with usual: sooner, usual or later (not sent by default)
  --pick <n>        Share only this hit, as numbered in the list (default: all not sent yet)
  --yes             Send without asking (still prints the report)
  --dry-run         Print the report and stop
  --json            Print JSON only (for the menu bar app)
  --api <url>       Send to another server (default https://hitmylimit.com/api/reports)
  -h, --help        Show this help
  -v, --version     Show the version

It reads only ~/.claude/projects and ~/.codex/sessions. It never reads login
or credential files and never contacts Anthropic or OpenAI.
`;

async function main() {
  const { values: o, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      days: { type: 'string', default: '30' },
      plan: { type: 'string', multiple: true },
      json: { type: 'boolean', default: false },
      work: { type: 'string' },
      account: { type: 'string' },
      felt: { type: 'string' },
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

  if (o.json && positionals[0] !== 'status' && !o.yes && !o['dry-run']) throw new Error('--json needs --yes or --dry-run');
  const days = Math.max(1, Math.min(60, Number(o.days) || 30));
  const since = Date.now() - days * DAY;
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !o.yes && !o.json;
  // --json prints one JSON value and nothing else, so the progress lines go nowhere.
  const log = o.json ? () => {} : (...a) => console.log(...a);
  // --plan max-5x applies to every lab; --plan anthropic=max-5x to one.
  const planFor = (lab) => {
    const given = o.plan ?? [];
    return given.find((p) => p.startsWith(`${lab}=`))?.slice(lab.length + 1) ?? given.find((p) => !p.includes('='));
  };
  const color = colors(process.stdout.isTTY && !process.env.NO_COLOR);
  const menu = (question, choices, start) => select(question, choices, start, { c: color });

  const ask = async (question, choices, fallback, preset) => {
    if (preset !== undefined) {
      if (choices.some(([k]) => k === preset)) return preset;
      throw new Error(`"${preset}" is not one of: ${choices.map(([k]) => k).join(', ')}`);
    }
    const def = Math.max(0, choices.findIndex(([k]) => k === fallback));
    if (!interactive) return choices[def][0];
    return menu(question, choices, def);
  };

  try {
    log(`hitmylimit ${version}`);
    log(`Reading Claude Code and Codex logs from the last ${days} days...`);
    const [claude, codex] = await Promise.all([readClaude(claudeDirs(), since), readCodex(codexDirs(), since)]);
    const statePathname = statePath();
    const state = await loadState(statePathname);
    const claudeFound = claudeHits(claude);
    const codexFound = codexHits(codex);
    if (positionals[0] === 'status') {
      const s = status({ claude, codex, claudeFound, codexFound, state });
      if (o.json) return console.log(JSON.stringify(s));
      return console.log(JSON.stringify(s, null, 2));
    }
    if (positionals.length) throw new Error(`Unknown command "${positionals[0]}". See --help.`);
    const found = [...claudeFound, ...codexFound].sort((a, b) => b.hit - a.hit);
    const note = unreadNote([['Claude Code', claude.unread], ['Codex', codex.unread]], color);

    if (!found.length) {
      const seen = [claude.usage.length && 'Claude Code', codex.usage.length && 'Codex'].filter(Boolean);
      log(
        seen.length
          ? `\nNo limit hits found in your ${seen.join(' and ')} logs from the last ${days} days.`
          : '\nNo Claude Code or Codex logs found on this computer.',
      );
      if (note) log(`\n${note}`);
      log('\nYou can still share a limit hit by hand at https://hitmylimit.com/share');
      if (o.json) console.log(JSON.stringify({ reports: [], sent: 0 }));
      return;
    }

    log(`\nLimit hits found: ${found.length}\n`);
    found.forEach((c, i) => {
      log(hitLines(c, i, { sent: state.sent.includes(hitKey(c)), c: color }).join('\n'));
      log();
    });
    if (note) log(`${note}\n`);

    // By default every hit not sent before is shared; --pick shares one, including one already sent.
    let chosen;
    if (o.pick !== undefined) {
      // A number from the list, or a hit's key as `status` prints it.
      const c = found[Number(o.pick) - 1] ?? found.find((f) => hitKey(f) === o.pick);
      if (!c) throw new Error(`--pick must be between 1 and ${found.length}`);
      chosen = [c];
    } else {
      chosen = found.filter((c) => !state.sent.includes(hitKey(c)));
      if (!chosen.length) {
        if (o.json) console.log(JSON.stringify({ reports: [], sent: 0 }));
        return log('\nAll of these were already sent. Use --pick to send one again.');
      }
    }

    // The plan Codex logged at the time of a hit is used as is. For the others the plan is asked once per lab;
    // the last answer is only a suggestion, since people change plans. Without a prompt, --plan is required.
    const plans = {};
    for (const lab of [...new Set(chosen.filter((c) => !c.plan).map((c) => c.lab))]) {
      if (!interactive && !planFor(lab)) throw new Error('Pass --plan with the plan you were on when you hit the limit');
      const n = chosen.filter((c) => c.lab === lab).length;
      plans[lab] = await ask(
        `Your ${lab === 'anthropic' ? 'Claude' : 'ChatGPT'} plan when you hit ${n === 1 ? 'this limit' : 'these limits'}:`,
        PLANS[lab],
        state.plans[lab],
        planFor(lab),
      );
    }
    // The rest has defaults and is only set with options, so the plan is the one question.
    const option = (choices, value, fallback) => {
      if (value === undefined) return fallback;
      if (choices.some(([k]) => k === value)) return value;
      throw new Error(`"${value}" is not one of: ${choices.map(([k]) => k).join(', ')}`);
    };
    const work = option(WORK, o.work, 'coding');
    const account = option(ACCOUNTS, o.account, 'own');
    // One optional keystroke, asked once for all the hits being sent.
    let felt = option(FELT, o.felt, null);
    if (interactive && o.felt === undefined) {
      felt = await menu(
        `Did ${chosen.length === 1 ? 'this limit' : 'these limits'} run out sooner than you're used to?`,
        [['skip', 'Skip'], ['sooner', 'Sooner than usual'], ['usual', 'About the same'], ['later', 'Later than usual']],
        0,
      );
    }
    const reports = chosen.map((c) => buildReport(c, {
      plan: plans[c.lab] ?? c.plan,
      work,
      account,
      felt: felt === 'skip' ? null : felt,
      clientId: state.client_id,
    }));
    const showData = () => {
      log(`\nThis is everything that will be sent:\n`);
      log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
      log('\nclient_id is a random id made on this computer. It is hashed before it is stored.');
    };

    if (o['dry-run'] || !interactive) showData();
    if (o['dry-run'] && o.json) return console.log(JSON.stringify({ reports, sent: 0 }));
    if (o['dry-run']) return log('\nDry run: nothing was sent.');
    if (interactive) {
      const what = reports.length === 1 ? 'this report' : `these ${reports.length} reports`;
      for (;;) {
        const a = await menu(`Send ${what} to hitmylimit.com?`, [['send', 'Send'], ['show', 'Show the exact data first'], ['cancel', 'Cancel']], 0);
        if (a === 'show') showData();
        else if (a === 'cancel') return log('Nothing was sent.');
        else break;
      }
    }

    Object.assign(state.plans, plans);
    let last = null;
    try {
      for (const [i, report] of reports.entries()) {
        last = await send(o.api, report);
        if (!state.sent.includes(hitKey(chosen[i]))) state.sent.push(hitKey(chosen[i]));
      }
    } finally {
      // Keep track of what got through even if a later report failed.
      await saveState(statePathname, state);
    }
    log(reports.length === 1
      ? `\n${last.duplicate ? 'This report was already sent.' : 'Sent. Thank you.'} ${comparisonLine(last.comparison)}`
      : `\nSent ${reports.length} reports. Thank you.`);
    log('Results by plan: https://hitmylimit.com/limits');
    if (o.json) console.log(JSON.stringify({ reports, sent: reports.length, duplicate: !!last?.duplicate, comparison: last?.comparison ?? null, comparison_line: comparisonLine(last?.comparison) || null }));
  } catch (e) {
    if (e.message === 'Nothing was sent.') return log(e.message);
    throw e;
  }
}

main().catch((e) => {
  console.error(`\nhitmylimit: ${e.message}`);
  process.exit(1);
});
