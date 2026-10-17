# hitmylimit

Share when you hit an AI usage limit, from your local Claude Code and Codex logs.

```sh
npx hitmylimit
```

It finds the times you hit a usage limit in the last 30 days, asks which plan you were on (unless Codex logged it),
prints the exact report, and sends it to [hitmylimit.com](https://hitmylimit.com/limits) only if you say yes.
Once a plan has 20 reports, the site shows how long people on it usually last before hitting the limit, and the
tool tells you how your report compares.

## What it reads

- Claude Code: `~/.claude/projects/**/*.jsonl` (or `$CLAUDE_CONFIG_DIR/projects`)
- Codex: `~/.codex/sessions/**/*.jsonl` (or `$CODEX_HOME/sessions`)

From those files it uses timestamps, token counts, model names, Codex's rate-limit percentages, and the text of the
"limit reached" notices. It never reads login or credential files, never contacts Anthropic or OpenAI, and never
sends prompts, code, file names or paths.

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
--days <n>        How far back to look (default 30)
--plan <plan>     e.g. pro, max-5x, max-20x, plus, pro-200
--work <kind>     coding, chat, research or other (default coding)
--account <type>  own, shared or reseller (default own)
--felt <answer>   sooner, usual or later than usual (not sent by default)
--pick <n>        Which limit hit to share
--yes             Send without asking
--dry-run         Print the report and stop
```

Not affiliated with Anthropic or OpenAI. MIT license.
