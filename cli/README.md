# hitmylimit

Share when you hit an AI usage limit: Claude, Claude Code, ChatGPT, Codex or Gemini.

```sh
npx hitmylimit
```

It starts by asking how to check:

- **Use my Claude Code / Codex login.** Asks Anthropic and OpenAI how full your 5-hour and weekly limits are right
  now, with the login Claude Code and Codex already saved on your computer. This counts claude.ai, ChatGPT, the apps
  and cloud agents, not only what ran on this computer. It asks before reading the login the first time.
- **Local logs only.** Reads Claude Code and Codex logs. Misses anything used in a browser, an app or the cloud.
- **I'll tell you.** Three quick questions (which app, which limit, when it resets). Works for any app.

It remembers your choice for next time. Then it asks which plan you were on (unless it already knows),
prints the exact reports, and sends every hit you haven't sent before to [hitmylimit.com](https://hitmylimit.com/limits)
only if you say yes.
Once a plan has 20 reports, the site shows how long people on it usually last before hitting the limit, and the
tool tells you how your report compares.

## What it reads

With **login**, it reads the login Claude Code saved (the macOS Keychain entry `Claude Code-credentials`, or
`~/.claude/.credentials.json`) and Codex saved (`~/.codex/auth.json`), and sends it only to
`api.anthropic.com/api/oauth/usage` and `chatgpt.com/backend-api/wham/usage`. It never sends the login to
hitmylimit, prints it, saves it or refreshes it. If the login has expired, open Claude Code or Codex once and try again.
These usage pages aren't documented by Anthropic or OpenAI, so they may change.

With **login** or **logs**, it also reads:

- Claude Code: `~/.claude/projects/**/*.jsonl` (or `$CLAUDE_CONFIG_DIR/projects`)
- Codex: `~/.codex/sessions/**/*.jsonl` (or `$CODEX_HOME/sessions`)

From those files it uses timestamps, token counts, model names, Codex's rate-limit percentages, and the text of the
"limit reached" notices. Unless you pick **login**, it never reads login files and never contacts Anthropic or OpenAI.
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

`client_id` and the list of reports you have sent are kept in `~/.config/hitmylimit/state.json`.

## How the window start is worked out

- Claude Code: from the reset time in the limit notice when it has one; otherwise from the 5-hour window the hit
  falls in, which starts at the hour of the first message after the previous window ended. Use of the Claude app
  also counts toward the limit and isn't in these logs, so token counts cover Claude Code only.
- Codex: from the reset time and window length in Codex's own rate-limit snapshots.

## Options

```
--source <how>    login, logs or manual (asked in a terminal; logs otherwise)
--days <n>        How far back to look (default 30)
--plan <plan>     e.g. pro, max-5x, max-20x, plus, pro-200
--work <kind>     coding, chat, research or other (default chat for chat apps, coding otherwise)
--account <type>  own, shared or reseller (default own)
--felt <answer>   sooner, usual or later than usual (not sent by default)
--pick <n>        Share only this hit (default: all not sent yet)
--yes             Send without asking (needed to send when not run in a terminal)
--dry-run         Print the report and stop
```

Not affiliated with Anthropic or OpenAI. MIT license.
