#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { claudeDirs, claudeHits, readClaude } from '../src/claude.js';
import { codexDirs, codexHits, readCodex } from '../src/codex.js';
import { ACCOUNTS, FELT, PLANS, WORK } from '../src/options.js';
import { buildReport, comparisonLine, send } from '../src/report.js';
import { select } from '../src/select.js';
import { hitKey, loadState, saveState, statePath } from '../src/state.js';
import { colors, hitLines, unreadNote } from '../src/display.js';
import { DAY, duration } from '../src/time.js';
import { APPS, askText, manualHit, parsePast, parseWhen, windowsFor } from '../src/manual.js';
import { claudeLogin, claudeUsage, codexLogin, codexUsage, usageHits } from '../src/usage.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `Usage: npx hitmylimit [options]

Reports when you run out of a Claude, ChatGPT, Codex or Gemini usage limit. It
starts by asking how to check:

  login   Use the login Claude Code and Codex saved on this computer to ask
          Anthropic and OpenAI how full your limits are right now. Counts
          claude.ai, ChatGPT and cloud use too. The login only goes to them.
  logs    Read Claude Code and Codex logs on this computer. Misses anything
          used in a browser, an app or the cloud.
  manual  Answer 3 quick questions. Works for any app.

It shows the exact reports and sends them to hitmylimit.com only if you agree.

Options:
  --source <how>    login, logs or manual (asked when run in a terminal; default
                    logs otherwise)
  --days <n>        How far back to look (default 30)
  --plan <plan>     Your plan, e.g. pro, max-5x, max-20x, plus, pro-200 (used where the logs
                    have no plan)
  --work <kind>     coding, chat, research or other (default chat for
                    claude.ai, ChatGPT and Gemini, coding otherwise)
  --account <type>  own, shared or reseller (default own)
  --felt <answer>   Compared with usual: sooner, usual or later (not sent by default)
  --pick <n>        Share only this hit, as numbered in the list (default: all not sent yet)
  --yes             Send without asking (still prints the report). Needed to send
                    when not run in a terminal
  --dry-run         Print the report and stop
  --api <url>       Send to another server (default https://hitmylimit.com/api/reports)
  -h, --help        Show this help
  -v, --version     Show the version

Without --source login it reads only ~/.claude/projects and ~/.codex/sessions,
never your login, and never contacts Anthropic or OpenAI.
`;

async function main() {
  const { values: o } = parseArgs({
    options: {
      days: { type: 'string', default: '30' },
      source: { type: 'string' },
      plan: { type: 'string' },
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

  const days = Math.max(1, Math.min(60, Number(o.days) || 30));
  const since = Date.now() - days * DAY;
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !o.yes;
  const color = colors(process.stdout.isTTY && !process.env.NO_COLOR);
  const menu = (question, choices, start) => select(question, choices, start, { c: color });

  // The three questions for a limit that left no logs here.
  const quickQuestions = async () => {
    const product = await menu('\nWhich app?', APPS.map(([k, label]) => [k, label]), 0);
    const lab = APPS.find(([k]) => k === product)[2];
    const window = await menu('Which limit ran out?', windowsFor(lab), 0);
    const now = new Date();
    let hit = now;
    if ((await menu('When?', [['now', 'Just now'], ['earlier', 'Earlier']], 0)) === 'earlier') {
      for (;;) {
        hit = parsePast(await askText('About when? (e.g. 2:30pm, 40m ago)'), now);
        if (hit) break;
        console.log('Try a time like 2:30pm or 40m ago.');
      }
    }
    for (;;) {
      const text = await askText('When does it reset? Type a time (3pm, Thu 9am, in 2h) or paste the limit message:');
      const resets = parseWhen(text, hit);
      const h = resets && manualHit({ product, lab, window, plan: null, hit, resets });
      if (h) return h;
      console.log(resets
        ? `That's ${duration((resets - hit) / 60_000)} after it ran out, which doesn't fit a ${windowsFor(lab).find(([k]) => k === window)[1]}. Check the time.`
        : "Couldn't read a time from that. Try 3pm, Thu 9am or in 2h.");
    }
  };

  const ask = async (question, choices, fallback, preset) => {
    if (preset !== undefined) {
      if (choices.some(([k]) => k === preset)) return preset;
      throw new Error(`"${preset}" is not one of: ${choices.map(([k]) => k).join(', ')}`);
    }
    const def = Math.max(0, choices.findIndex(([k]) => k === fallback));
    if (!interactive) return choices[def][0];
    return menu(question, choices, def);
  };

  const SOURCES = [
    ['login', 'Use my Claude Code / Codex login   live, includes claude.ai and cloud'],
    ['logs', 'Local logs only                    misses browser, app and cloud'],
    ['manual', "I'll tell you                      3 quick questions, any app"],
  ];
  const LAB_NAME = { anthropic: 'Claude', openai: 'ChatGPT', google: 'Gemini' };

  try {
    console.log(color.bold(`hitmylimit ${version}`));
    const statePathname = statePath();
    const state = await loadState(statePathname);

    let source = o.source;
    if (source !== undefined && !SOURCES.some(([k]) => k === source)) throw new Error('--source must be login, logs or manual');
    if (source === undefined) {
      source = interactive ? await menu('\nHow should we check your limits?', SOURCES, Math.max(0, SOURCES.findIndex(([k]) => k === state.source))) : 'logs';
    }
    if (source === 'manual' && !interactive) throw new Error('--source manual needs a terminal to answer the questions');
    // Reading the login is asked for once, in plain words, before it happens. --source login counts as asking.
    if (source === 'login' && interactive && !state.login_ok && o.source === undefined) {
      console.log(color.dim([
        '',
        'This reads the login Claude Code and Codex saved on this computer and uses it',
        'only to ask Anthropic and OpenAI how full your limits are. The login is never',
        'sent to hitmylimit, printed or saved. On a Mac, the Keychain may ask first.',
      ].join('\n')));
      const ok = await menu('Go ahead?', [['yes', 'Yes, check my usage'], ['logs', 'No, use local logs instead']], 0);
      if (ok === 'yes') state.login_ok = true;
      else source = 'logs';
    }
    state.source = source;

    const found = [];
    let note = null;
    let live = [];
    if (source === 'login') {
      const [cl, cx] = await Promise.all([claudeLogin(), codexLogin()]);
      if (!cl && !cx) console.log('\nNo Claude Code or Codex login found on this computer. Checking local logs instead.');
      const checks = [cl && ['Claude', () => claudeUsage(cl)], cx && ['ChatGPT / Codex', () => codexUsage(cx)]].filter(Boolean);
      for (const [name, check] of checks) {
        try {
          live.push(await check());
        } catch (e) {
          const why = e.message === 'login expired'
            ? `login expired; open ${name === 'Claude' ? 'Claude Code' : 'Codex'} once and run this again`
            : e.message;
          console.log(`\n${name}: couldn't check usage (${why}).`);
        }
      }
      for (const u of live) {
        console.log(`\n${color.bold(u.name)}${u.plan ? color.dim(`  ${PLANS[u.lab].find(([k]) => k === u.plan)?.[1] ?? u.plan}`) : ''}`);
        for (const w of u.windows) console.log(usageLine(w, color));
      }
    }
    if (source === 'login' || source === 'logs') {
      console.log(color.dim(`\nReading Claude Code and Codex logs from the last ${days} days...`));
      const [claude, codex] = await Promise.all([readClaude(claudeDirs(), since), readCodex(codexDirs(), since)]);
      found.push(...claudeHits(claude), ...codexHits(codex));
      note = unreadNote([['Claude Code', claude.unread], ['Codex', codex.unread]], color);
      if (!found.length && source === 'logs') {
        const seen = [claude.usage.length && 'Claude Code', codex.usage.length && 'Codex'].filter(Boolean);
        console.log(seen.length ? `No limit hits in your ${seen.join(' and ')} logs from the last ${days} days.` : 'No Claude Code or Codex logs on this computer.');
      }
    }

    // A full window from the live check. The logs may already have the same hit, with token counts.
    const now = Date.now();
    for (const u of live) {
      for (const h of usageHits(u, now)) {
        if (found.some((f) => f.lab === h.lab && f.window === h.window && Math.abs(f.start - h.start) < 15 * 60_000)) continue;
        if (state.sent.includes(hitKey(h))) {
          found.push(h);
          continue;
        }
        if (interactive) {
          const when = await menu(`\nYour ${u.name} ${h.window === '5h' ? '5-hour' : 'weekly'} limit is used up. When did it run out?`, [['now', 'Just now'], ['earlier', 'Earlier']], 0);
          if (when === 'earlier') {
            for (;;) {
              const t = parsePast(await askText('About when? (e.g. 2:30pm, 40m ago)'), new Date(now));
              if (t && t.getTime() > h.start) {
                h.hit = t.getTime();
                break;
              }
              console.log(color.dim(`That doesn't fit this window, which started ${new Date(h.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Try again.`));
            }
          }
        }
        found.push(h);
      }
    }

    if (source === 'manual' || (!found.length && interactive)) {
      if (source !== 'manual') {
        console.log(source === 'login' && live.length
          ? '\nNothing is used up right now. Run npx hitmylimit again when you run out.'
          : '');
        const more = await menu('Report a limit from another app (claude.ai, ChatGPT, Gemini...)?', [['no', 'No, done'], ['yes', 'Yes, 3 quick questions']], 0);
        if (more === 'no') return saveState(statePathname, state);
      }
      found.push(await quickQuestions());
    }

    if (!found.length) {
      if (note) console.log(`\n${note}`);
      console.log('\nYou can also share a limit hit by hand at https://hitmylimit.com/share');
      return saveState(statePathname, state);
    }

    found.sort((a, b) => b.hit - a.hit);
    console.log(`\nLimit hits: ${found.length}\n`);
    found.forEach((c, i) => {
      console.log(hitLines(c, i, { sent: state.sent.includes(hitKey(c)), c: color }).join('\n'));
      console.log();
    });
    if (note) console.log(`${note}\n`);

    // By default every hit not sent before is shared; --pick shares one, including one already sent.
    let chosen;
    if (o.pick !== undefined) {
      const c = found[Number(o.pick) - 1];
      if (!c) throw new Error(`--pick must be between 1 and ${found.length}`);
      chosen = [c];
    } else {
      chosen = found.filter((c) => !state.sent.includes(hitKey(c)));
      if (!chosen.length) {
        await saveState(statePathname, state);
        return console.log('\nAll of these were already sent. Use --pick to send one again.');
      }
    }

    // The plan Codex logged at the time of a hit is used as is. For the others the plan is asked once per lab;
    // the last answer is only a suggestion, since people change plans. Without a prompt, --plan is required.
    const plans = {};
    for (const lab of [...new Set(chosen.filter((c) => !c.plan).map((c) => c.lab))]) {
      if (!interactive && !o.plan) throw new Error('Pass --plan with the plan you were on when you hit the limit');
      const n = chosen.filter((c) => c.lab === lab).length;
      plans[lab] = await ask(
        `Your ${LAB_NAME[lab]} plan when you hit ${n === 1 ? 'this limit' : 'these limits'}:`,
        PLANS[lab],
        state.plans[lab],
        o.plan,
      );
    }
    // The rest has defaults and is only set with options, so the plan is the one question.
    const option = (choices, value, fallback) => {
      if (value === undefined) return fallback;
      if (choices.some(([k]) => k === value)) return value;
      throw new Error(`"${value}" is not one of: ${choices.map(([k]) => k).join(', ')}`);
    };
    // Chat apps default to chat, coding tools to coding.
    const work = option(WORK, o.work, null);
    const APP_PRODUCTS = ['claude-app', 'chatgpt', 'gemini-app'];
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
      work: work ?? (APP_PRODUCTS.includes(c.product) ? 'chat' : 'coding'),
      account,
      felt: felt === 'skip' ? null : felt,
      clientId: state.client_id,
    }));
    const showData = () => {
      console.log(`\nThis is everything that will be sent:\n`);
      console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
      console.log('\nclient_id is a random id made on this computer. It is hashed before it is stored.');
    };

    if (o['dry-run'] || !interactive) showData();
    if (o['dry-run']) return console.log('\nDry run: nothing was sent.');
    // Without a terminal there is no one to confirm, so sending needs --yes.
    if (!interactive && !o.yes) return console.log('\nNothing was sent. Run with --yes to send without a prompt.');
    if (interactive) {
      const what = reports.length === 1 ? 'this report' : `these ${reports.length} reports`;
      for (;;) {
        const a = await menu(`Send ${what} to hitmylimit.com?`, [['send', 'Send'], ['show', 'Show the exact data first'], ['cancel', 'Cancel']], 0);
        if (a === 'show') showData();
        else if (a === 'cancel') return console.log('Nothing was sent.');
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
    console.log(reports.length === 1
      ? `\n${last.duplicate ? 'This report was already sent.' : 'Sent. Thank you.'} ${comparisonLine(last.comparison)}`
      : `\nSent ${reports.length} reports. Thank you.`);
    console.log('Results by plan: https://hitmylimit.com/limits');
  } catch (e) {
    if (e.message === 'Nothing was sent.') return console.log(e.message);
    throw e;
  }
}

function usageLine(w, k) {
  const bar = '█'.repeat(Math.round(w.used / 10)).padEnd(10, '░');
  const left = Math.max(0, (w.resets.getTime() - Date.now()) / 60_000);
  const label = (w.window === '5h' ? '5-hour' : 'weekly').padEnd(8);
  const text = `  ${label}${bar} ${String(w.used).padStart(3)}%   resets in ${duration(left)}`;
  return w.used >= 100 ? k.bold(`${text}   used up`) : text;
}

main().catch((e) => {
  console.error(`\nhitmylimit: ${e.message}`);
  process.exit(1);
});
