# hitmylimit

Share when you hit an AI usage limit: Claude, Claude Code, ChatGPT, Codex or Gemini.

```sh
npx hitmylimit
```

It reads your Claude Code and Codex logs and shows any limit you ran out of that you haven't sent yet. Press Enter
to send it to [hitmylimit.com](https://hitmylimit.com/limits). The first time, it asks your Claude plan (or skip, if you don't use Claude) and remembers it.

Each hit shows how long the limit lasted, the token count and a bar per model:

```
  1  2026-10-18  Claude Code, 5-hour limit  new
     Ran out 3h 35m after the window started (23:00 UTC)
     3.8M tokens, 40 requests, 95% read from cache
     opus    ███████████████░░░░░   78%  3.0M
     sonnet  ████░░░░░░░░░░░░░░░░   22%  840K
```

If there's nothing new, it lists your last few hits, marked "(sent to hitmylimit)".

To report a limit the logs don't show, use `--source login` (asks Anthropic and OpenAI how full your limits are right
now, including claude.ai, ChatGPT and cloud agents) or `--source manual` (3 quick questions, any app).

Once a plan has 20 reports, the site shows how long people on it usually last before hitting the limit, and the
tool tells you how your report compares.

## Report automatically from Claude Code

```sh
npx hitmylimit hook on
```

This adds a hook to Claude Code (`StopFailure` with the `rate_limit` matcher, in `~/.claude/settings.json`). Each time
Claude Code stops on a usage limit, you get a desktop notification like:

```
Claude Pro: 5-hour limit out after 3h 15m
Sooner than 62% of Pro reports
Opus 78% · Sonnet 22%
```

Until your plan has 20 reports, the second line compares with your own week instead ("2nd time this week, 40m
sooner than Tue"). The hook sends that report right away, without asking, and the next time you run
`npx hitmylimit` you see it in full. It asks before turning on, and `npx hitmylimit hook off` removes it. Other
settings and hooks are left as they are.

The hook runs a copy of this tool kept in `~/.config/hitmylimit/cli`, so it works without npx. Codex has no such hook,
but it writes how full your limits are into its own logs, so a normal run already finds Codex hits.

## What it reads

With the **live check**, it reads the login Claude Code saved (the macOS Keychain entry `Claude Code-credentials`, or
`~/.claude/.credentials.json`) and Codex saved (`~/.codex/auth.json`), and sends it only to
`api.anthropic.com/api/oauth/usage` and `chatgpt.com/backend-api/wham/usage`. It never sends the login to
hitmylimit, prints it, saves it or refreshes it. If the login has expired, open Claude Code or Codex once and try again.
These usage pages aren't documented by Anthropic or OpenAI, so they may change.

It always reads:

- Claude Code: `~/.claude/projects/**/*.jsonl` (or `$CLAUDE_CONFIG_DIR/projects`)
- Codex: `~/.codex/sessions/**/*.jsonl` (or `$CODEX_HOME/sessions`)

From those files it uses timestamps, token counts, model names, Codex's rate-limit percentages, and the text of the
"limit reached" notices. Until you say yes to the live check, it never reads login files and never contacts Anthropic or OpenAI.
It never sends prompts, code, file names or paths.

Reports from the login or the quick questions have no token counts, so `tokens`, `models` and `requests` are null.

## What it sends

```json
{
  "lab": "anthropic",
  "product": "claude-code",
  "plan": "max-5x",
  "window": "5h",
  "minutes_to_limit": 155,
  "hit_on": "2026-10-16",
  "model": "opus",
  "models": {
    "opus": { "total": 3600000, "input": 25, "output": 35000, "cache_read": 3340000, "cache_write": 224975 },
    "sonnet": { "total": 601030, "input": 5, "output": 6000, "cache_read": 560000, "cache_write": 35025 }
  },
  "work": "coding",
  "account": "own",
  "felt": "sooner",
  "tokens": { "input": 30, "output": 41000, "cache_read": 3900000, "cache_write": 260000, "total": 4201030 },
  "requests": 412,
  "start_hour": 14,
  "weekly_used": null,
  "tool_version": "2.1.160",
  "source": "cli",
  "client_id": "random id made on your computer"
}
```

- `requests`: how many model responses the window took.
- `start_hour`: the hour the window started, in UTC (0–23).
- `weekly_used`: Codex only. How full the weekly limit was, in percent, when a 5-hour limit ran out.
- Codex reports also carry `reasoning` tokens, which are part of `output`.

`client_id`, the list of reports you have sent, your plan and your answers to the questions above are kept in
`~/.config/hitmylimit/state.json`.

## How the window start is worked out

- Claude Code: from the reset time in the limit notice when it has one; otherwise from the 5-hour window the hit
  falls in, which starts at the hour of the first message after the previous window ended. Use of the Claude app
  also counts toward the limit and isn't in these logs, so token counts cover Claude Code only.
- Codex: from the reset time and window length in Codex's own rate-limit snapshots.

## Options

```
hook on|off       Send automatically when Claude Code runs out, or stop
--source <how>    Skip straight to one check: login, logs or manual
--plan <plan>     e.g. pro, max-5x, max-20x, plus, pro-200 (remembered)
--days <n>        How far back to look (default 30)
--work <kind>     coding, chat, research or other (default chat for chat apps, coding otherwise)
--account <type>  own, shared or reseller (default own)
--felt <answer>   sooner, usual or later than usual (not sent by default)
--all             Also list hits that were already sent
--pick <n>        Send only this hit, as numbered with --all
--show            Print the exact data before asking to send
--yes             Send without asking (needed to send when not run in a terminal)
--dry-run         Go through everything but send nothing
```

Not affiliated with Anthropic or OpenAI. MIT license.
