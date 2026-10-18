#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { claudeDirs, claudeHits, readClaude } from '../src/claude.js';
import { codexDirs, codexHits, readCodex } from '../src/codex.js';
import { ACCOUNTS, FELT, PLANS, WINDOW_NAMES, WORK } from '../src/options.js';
import { buildReport, comparisonLine, send } from '../src/report.js';
import { keypress, select } from '../src/select.js';
import { hitKey, loadState, saveState, statePath } from '../src/state.js';
import { colors, hitLines, unreadNote } from '../src/display.js';
import { DAY, duration } from '../src/time.js';
import { APPS, askText, manualHit, parsePast, parseWhen, windowsFor } from '../src/manual.js';
import { claudeLogin, claudeUsage, codexLogin, codexUsage, usageHits } from '../src/usage.js';
import { hookSummary, unusual } from '../src/summary.js';
import { addHook, claudeSettingsPath, hasHook, installCopy, notify, readSettings, removeHook, writeSettings } from '../src/hook.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `Usage: npx hitmylimit [options]
       npx hitmylimit hook on|off

Reports when you run out of a Claude, ChatGPT, Codex or Gemini usage limit.

It reads your Claude Code and Codex logs, shows any limit you ran out of that
hasn't been sent yet, and sends it to hitmylimit.com when you press Enter. If
there's nothing in the logs, it can check live with your Claude Code / Codex
login (which counts claude.ai, ChatGPT and cloud use) or ask 3 quick questions.

  hook on    Send a report automatically each time Claude Code stops on a usage
             limit, with a desktop notification. Asks first.
  hook off   Stop sending automatically.

Options:
  --source <how>    Skip straight to one check: login, logs or manual
  --plan <plan>     Your plan, e.g. pro, max-5x, max-20x, plus, pro-200 (remembered)
  --days <n>        How far back to look in the logs (default 30)
  --work <kind>     coding, chat, research or other (default chat for
                    claude.ai, ChatGPT and Gemini, coding otherwise)
  --account <type>  own, shared or reseller (default own)
  --felt <answer>   Compared with usual: sooner, usual or later (not sent by default)
  --all             Also list hits that were already sent
  --pick <n>        Send only this hit, as numbered with --all
  --show            Print the exact data before asking to send
  --yes             Send without asking. Needed to send when not run in a terminal
  --dry-run         Go through everything but send nothing
  --api <url>       Send to another server (default https://hitmylimit.com/api/reports)
  -h, --help        Show this help
  -v, --version     Show the version

It reads ~/.claude/projects and ~/.codex/sessions. It reads your login and
contacts Anthropic or OpenAI only after you say yes to the live check.
`;

const LAB_NAME = { anthropic: 'Claude', openai: 'ChatGPT', google: 'Gemini' };
const APP_PRODUCTS = ['claude-app', 'chatgpt', 'gemini-app'];
const planName = (lab, plan) => PLANS[lab].find(([k]) => k === plan)?.[1] ?? plan;
// The offer to turn the hook on leads with what you get back each time.
const hookOffer = (plan) => {
  const name = plan ? planName('anthropic', plan) : 'Pro';
  return [
    '',
    'Want a heads-up next time Claude Code runs out?',
    `  You'll get a notification like "Claude ${name}: 5-hour limit out after 3h 15m,`,
    `  sooner than 62% of ${name} reports". It also sends that report to hitmylimit:`,
    '  plan, models, token counts and time to limit. Never your prompts or code.',
    '  Turn it off any time: npx hitmylimit hook off',
  ].join('\n');
};

async function main() {
  const { values: o, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      days: { type: 'string', default: '30' },
      source: { type: 'string' },
      plan: { type: 'string' },
      work: { type: 'string' },
      account: { type: 'string' },
      felt: { type: 'string' },
      all: { type: 'boolean', default: false },
      pick: { type: 'string' },
      show: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      api: { type: 'string', default: process.env.HITMYLIMIT_API || 'https://hitmylimit.com/api/reports' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (o.help) return console.log(HELP);
  if (o.version) return console.log(version);
  if (positionals[0] === 'hook' && positionals[1] === 'run') return runHook(o);

  const interactive = process.stdin.isTTY && process.stdout.isTTY && !o.yes;
  const color = colors(process.stdout.isTTY && !process.env.NO_COLOR);
  const menu = (question, choices, start) => select(question, choices, start, { c: color });
  const key = (question, keys) => keypress(question, keys, { c: color });
  const statePathname = statePath();
  const state = await loadState(statePathname);
  const save = () => saveState(statePathname, state);

  const choose = (choices, value, fallback) => {
    if (value === undefined) return fallback;
    if (choices.some(([k]) => k === value)) return value;
    throw new Error(`"${value}" is not one of: ${choices.map(([k]) => k).join(', ')}`);
  };
  // The plan is asked once per lab and remembered. --plan changes it.
  const askPlan = async (lab, force = false) => {
    if (o.plan !== undefined) return (state.plans[lab] = choose(PLANS[lab], o.plan));
    if (state.plans[lab] && !force) return state.plans[lab];
    if (!interactive) throw new Error('Pass --plan with the plan you were on when you hit the limit');
    const def = Math.max(0, PLANS[lab].findIndex(([k]) => k === state.plans[lab]));
    return (state.plans[lab] = await menu(`Your ${LAB_NAME[lab]} plan:`, PLANS[lab], def));
  };

  try {
    console.log(color.bold(`hitmylimit ${version}`));

    if (positionals[0] === 'hook') {
      if (positionals[1] === 'on') return await hookOn();
      if (positionals[1] === 'off') return await hookOff();
      throw new Error('Use: npx hitmylimit hook on, or npx hitmylimit hook off');
    }
    if (positionals.length) throw new Error(`Unknown command "${positionals.join(' ')}". See npx hitmylimit --help`);

    // What the hook sent while Claude Code was running, shown once.
    if (state.last_auto && !state.last_auto.shown && interactive) {
      const a = state.last_auto;
      console.log(`\nSent automatically when Claude Code ran out:\n`);
      console.log(hitLines(a.hit, 0, { sent: true, plans: state.plans, c: color }).join('\n'));
      if (a.summary) console.log(`\n${a.summary.line}.${a.summary.models ? ` ${a.summary.models}.` : ''}`);
      else if (a.comparison) console.log(`\n${comparisonLine(a.comparison)}`);
      a.shown = true;
    }

    // The Claude plan comes first, once. People who don't use Claude skip it and aren't asked again.
    if (interactive && !state.plans.anthropic && !state.no_claude && o.plan === undefined) {
      const plan = await menu('\nYour Claude plan:', [...PLANS.anthropic, ['skip', "Skip, I don't use Claude"]], 1);
      if (plan === 'skip') state.no_claude = true;
      else state.plans.anthropic = plan;
    }

    const source = choose([['login'], ['logs'], ['manual']], o.source, null);
    if (source === 'manual' && !interactive) throw new Error('--source manual needs a terminal to answer the questions');
    if (source === 'login') state.login_ok = true;
    let found = [];
    let note = null;
    let logsSeen = [];
    if (source !== 'manual') {
      const days = Math.max(1, Math.min(60, Number(o.days) || 30));
      console.log(color.dim(`\nChecking your Claude Code and Codex logs from the last ${days} days...`));
      const [claude, codex] = await Promise.all([readClaude(claudeDirs(), Date.now() - days * DAY), readCodex(codexDirs(), Date.now() - days * DAY)]);
      found = [...claudeHits(claude), ...codexHits(codex)];
      note = unreadNote([['Claude Code', claude.unread], ['Codex', codex.unread]], color);
      logsSeen = [claude.usage.length && 'Claude Code', codex.usage.length && 'Codex'].filter(Boolean);
      // Once the live check is allowed, it runs every time with the logs.
      if (state.login_ok && source !== 'logs') found = merge(found, await liveCheck());
    }

    const isNew = (c) => !state.sent.includes(hitKey(c));
    let list = o.all || o.pick !== undefined ? found : found.filter(isNew);
    if (!list.length && source !== null) {
      if (source === 'manual') list = [await quickQuestions()];
      else if (interactive) console.log('\nNo new limit hits.');
    } else if (!list.length && interactive) {
      if (found.length) {
        // Nothing new, but the past hits are still worth seeing.
        const past = [...found].sort((a, b) => b.hit - a.hit);
        console.log('\nNo new limit hits. Your recent ones:\n');
        past.slice(0, 5).forEach((c, i) => console.log(`${hitLines(c, i, { sent: true, plans: state.plans, c: color }).join('\n')}\n`));
        if (past.length > 5) console.log(color.dim(`${past.length - 5} more: npx hitmylimit --all\n`));
      } else console.log(logsSeen.length ? `No limit hits in your ${logsSeen.join(' and ')} logs.` : 'No Claude Code or Codex logs on this computer.');
    }
    if (!list.length) {
      if (note) console.log(`\n${note}`);
      if (!interactive) console.log('No new limit hits.');
      await save();
      return offerHook(logsSeen.includes('Claude Code'));
    }

    list.sort((a, b) => b.hit - a.hit);
    console.log();
    list.forEach((c, i) => {
      console.log(hitLines(c, i, { sent: !isNew(c), plans: state.plans, c: color }).join('\n'));
      console.log();
    });
    if (note) console.log(`${note}\n`);

    let chosen = list.filter(isNew);
    if (o.pick !== undefined) {
      const c = list[Number(o.pick) - 1];
      if (!c) throw new Error(`--pick must be between 1 and ${list.length}`);
      chosen = [c];
    }
    if (!chosen.length) {
      await save();
      return console.log('All of these were already sent. Use --pick to send one again.');
    }

    // Codex logs the plan; the rest use the remembered plan, asked the first time.
    const plans = {};
    const remembered = { ...state.plans };
    for (const lab of new Set(chosen.filter((c) => !c.plan).map((c) => c.lab))) plans[lab] = await askPlan(lab);
    // Claude doesn't log the plan, so a hit far off the usual is the only sign it changed. Ask once.
    const odd = plans.anthropic && remembered.anthropic && interactive && o.plan === undefined
      && chosen.map((c) => c.lab === 'anthropic' && unusual(c, found)).find(Boolean);
    if (odd) {
      const name = `Claude ${planName('anthropic', plans.anthropic)}`;
      const a = await key(`\nThis one used ${odd === 'more' ? 'over twice' : 'under half'} your usual before the limit. Still on ${name}?`,
        [['y', 'yes'], ['n', 'change plan']]);
      if (a === 'n') plans.anthropic = await askPlan('anthropic', true);
    }
    const work = choose(WORK, o.work, null);
    const account = choose(ACCOUNTS, o.account, 'own');
    const felt = choose(FELT, o.felt, null);
    const reportsFor = () => chosen.map((c) => buildReport(c, {
      plan: plans[c.lab] ?? c.plan,
      work: work ?? (APP_PRODUCTS.includes(c.product) ? 'chat' : 'coding'),
      account,
      felt,
      clientId: state.client_id,
    }));
    let reports = reportsFor();
    const showData = () => {
      console.log(`\nThis is everything that will be sent:\n`);
      console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
      console.log('\nclient_id is a random id made on this computer. It is hashed before it is stored.\n');
    };

    if (o.show) showData();
    if (o['dry-run']) {
      await save();
      return console.log(`Dry run: nothing was sent.${o.show ? '' : ' Add --show to see the exact data.'}`);
    }
    // Without a terminal there is no one to confirm, so sending needs --yes.
    if (!interactive && !o.yes) return console.log('Nothing was sent. Run with --yes to send without a prompt.');
    if (interactive) {
      for (;;) {
        const as = [...new Set(reports.map((r) => `${LAB_NAME[r.lab]} ${planName(r.lab, r.plan)}`))].join(', ');
        const what = reports.length === 1 ? 'Send this' : `Send these ${reports.length}`;
        const keys = [['send', 'send'], ['p', 'change plan'], ['s', 'show data'], ['n', 'cancel']];
        const a = await key(`${what} as ${as}?`, keys);
        if (a === 'n') {
          await save();
          return console.log('Nothing was sent.');
        }
        if (a === 's') showData();
        if (a === 'p') {
          for (const lab of new Set(chosen.map((c) => c.lab))) plans[lab] = await askPlan(lab, true);
          reports = reportsFor();
        }
        if (a === 'send') break;
      }
    }

    let last = null;
    try {
      for (const [i, report] of reports.entries()) {
        last = await send(o.api, report);
        if (isNew(chosen[i])) state.sent.push(hitKey(chosen[i]));
      }
    } finally {
      // Keep track of what got through even if a later report failed.
      await save();
    }
    console.log(reports.length === 1
      ? `\n${last.duplicate ? 'This report was already sent.' : 'Sent. Thank you.'} ${comparisonLine(last.comparison)}`
      : `\nSent ${reports.length} reports. Thank you.`);
    console.log('Results by plan: https://hitmylimit.com/limits');
    await offerHook(logsSeen.includes('Claude Code'));
  } catch (e) {
    if (e.message === 'Nothing was sent.') {
      await save();
      return console.log(e.message);
    }
    throw e;
  }

  // The live check: how full each limit is now, and a hit for any that is used up.
  async function liveCheck() {
    const [cl, cx] = await Promise.all([claudeLogin(), codexLogin()]);
    if (!cl && !cx) {
      console.log('No Claude Code or Codex login found on this computer.');
      return [];
    }
    const hits = [];
    for (const [name, check] of [cl && ['Claude', () => claudeUsage(cl)], cx && ['ChatGPT / Codex', () => codexUsage(cx)]].filter(Boolean)) {
      try {
        const u = await check();
        console.log(`\n${color.bold(u.name)}${u.plan ? color.dim(`  ${planName(u.lab, u.plan)}`) : ''}`);
        for (const w of u.windows) console.log(usageLine(w, color));
        hits.push(...usageHits(u));
      } catch (e) {
        const why = e.message === 'login expired' ? `login expired; open ${name === 'Claude' ? 'Claude Code' : 'Codex'} once and try again` : e.message;
        console.log(`\n${name}: couldn't check usage (${why}).`);
      }
    }
    return hits;
  }

  // The three questions for a limit that left no logs here.
  async function quickQuestions() {
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
  }

  // Asked once, to people who use Claude Code, after a run.
  async function offerHook(usesClaudeCode) {
    if (!interactive || !usesClaudeCode || state.hook || state.hook_offered) return;
    state.hook_offered = true;
    await save();
    console.log(hookOffer(state.plans.anthropic));
    if ((await menu('Turn it on?', [['no', 'Not now'], ['yes', 'Yes, notify me']], 0)) === 'yes') {
      await turnHookOn();
    }
  }

  async function hookOn() {
    if (!o.yes) {
      if (!interactive) throw new Error('Run this in a terminal, or pass --yes to turn it on without asking');
      console.log(hookOffer(state.plans.anthropic));
      if ((await menu('Turn it on?', [['yes', 'Yes, notify me'], ['no', 'Not now']], 0)) === 'no') return console.log('Nothing was changed.');
    }
    await turnHookOn();
  }

  async function turnHookOn() {
    // The hook can't ask questions, so the plan is settled now.
    await askPlan('anthropic');
    const path = claudeSettingsPath();
    const settings = await readSettings(path);
    const command = await installCopy(join(dirname(statePathname), 'cli'));
    await writeSettings(path, addHook(settings, command));
    state.hook = true;
    state.hook_offered = true;
    await save();
    console.log(`\nOn. Next time Claude Code runs out, you'll get a notification. (Added to ${path})`);
    console.log(`Reports go out as Claude ${planName('anthropic', state.plans.anthropic)}. Change it with: npx hitmylimit hook on --plan <plan>`);
    console.log('Turn it off with: npx hitmylimit hook off');
  }

  async function hookOff() {
    const path = claudeSettingsPath();
    const settings = await readSettings(path);
    if (hasHook(settings)) await writeSettings(path, removeHook(settings));
    state.hook = false;
    await save();
    console.log(`\nOff. Removed from ${path}. Nothing will be sent automatically.`);
  }
}

// Run by Claude Code when a turn stops on an API error. It never prints anything Claude Code would show, never
// asks, and never fails loudly: the worst case is that nothing is sent.
async function runHook(o) {
  const statePathname = statePath();
  const log = (msg) => appendFile(join(dirname(statePathname), 'hook.log'), `${new Date().toISOString()} ${msg}\n`).catch(() => {});
  try {
    const input = JSON.parse((await readStdin()) || '{}');
    if (input.error && input.error !== 'rate_limit') return;
    const state = await loadState(statePathname);
    if (!state.hook) return;

    // Claude Code may write its limit notice just after the turn stops, so look again a few times.
    let hit = null;
    let hits = [];
    for (let i = 0; i < 4 && !hit; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1500));
      hits = claudeHits(await readClaude(claudeDirs(), Date.now() - 8 * DAY));
      hit = hits.filter((h) => h.hit >= Date.now() - 15 * 60_000).pop() ?? null;
    }
    if (!hit && state.login_ok) {
      const login = await claudeLogin().catch(() => null);
      if (login) hit = usageHits(await claudeUsage(login).catch(() => ({ windows: [] }))).pop() ?? null;
    }
    // A short API rate limit, not a plan's usage limit.
    if (!hit || state.sent.includes(hitKey(hit))) return;

    const plan = state.plans.anthropic;
    let seq;
    if (!plan) {
      seq = await notify({ title: `Claude ${WINDOW_NAMES[hit.window]} limit ran out`, body: 'Run npx hitmylimit to send it.' });
    } else {
      const report = buildReport(hit, { plan, work: 'coding', account: 'own', clientId: state.client_id });
      try {
        const res = await send(o.api, report);
        state.sent.push(hitKey(hit));
        const summary = hookSummary(hit, plan, res.comparison ?? null, hits);
        state.last_auto = { hit, summary, comparison: res.comparison ?? null, shown: false };
        await saveState(statePathname, state);
        seq = await notify({ title: summary.title, subtitle: summary.line, body: summary.models });
      } catch (e) {
        log(`send failed: ${e.message}`);
        seq = await notify({ title: `Claude ${WINDOW_NAMES[hit.window]} limit ran out`, body: "Couldn't send it. Run npx hitmylimit to try again." });
      }
    }
    if (seq) process.stdout.write(JSON.stringify({ terminalSequence: seq }) + '\n');
  } catch (e) {
    await log(`error: ${e.message}`);
  }
}

function readStdin() {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let text = '';
    const timer = setTimeout(() => resolve(text), 3000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (text += d));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(text);
    });
  });
}

// A used-up window from the live check. The logs may already have the same hit, with token counts.
function merge(fromLogs, fromLogin) {
  const out = [...fromLogs];
  for (const h of fromLogin) {
    if (!out.some((f) => f.lab === h.lab && f.window === h.window && Math.abs(f.start - h.start) < 15 * 60_000)) out.push(h);
  }
  return out;
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
