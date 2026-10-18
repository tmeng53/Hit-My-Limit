# Hit My Limit

[hitmylimit.com](https://hitmylimit.com) shows how much usage AI plans give before you hit the limit, from
anonymous reports, and keeps a dated, sourced log of every change the labs make to those limits.

It covers Claude and Claude Code, ChatGPT and Codex, and Gemini and Gemini CLI. English at `/`, Chinese at `/zh/`.

## Share a limit

```sh
npx hitmylimit
```

It finds limits you ran out of in your Claude Code and Codex logs and sends the one you pick. For anything the
logs don't show (claude.ai, ChatGPT, Gemini), run `npx hitmylimit --source manual` or use the form at
[hitmylimit.com/share](https://hitmylimit.com/share).

To report automatically whenever Claude Code runs out, run `npx hitmylimit hook on`. It asks first, and
`npx hitmylimit hook off` removes it. Details are in [`cli/README.md`](cli/README.md).

Once a plan has 20 reports with token counts, [/limits](https://hitmylimit.com/limits) shows the median usage
before the limit, week over week, and you see how your report compares.

## How usage is measured

Labs don't publish how big their plans are, so the site measures it from the tokens in Claude Code and Codex logs.
Raw token counts would mislead: most tokens are cache reads, which cost about a tenth of normal input, and an Opus
token costs more than a Sonnet one. So each report's tokens are priced at the model's public API rates and added
up, giving one dollar figure per hit. The prices are a fixed yardstick in [`src/lib/pricing.ts`](src/lib/pricing.ts),
not what anyone paid, so when the median drops for a plan, the plan is giving less. Time to the limit is still
shown next to it. Reports without token counts (the form, the chat apps) count toward time only.

## What gets sent

A report is: lab, product, plan, which limit, the date, minutes from the window start to the limit (rounded to 5),
kind of work, account type, the UTC hour the window started, and from the command-line tool, token counts per
model, number of requests, weekly limit use and tool version. Plus a random id made on your computer, which is
hashed before it's stored.

Never sent or stored: prompts, code, file names or paths, account or login details, time zone, IP address.
The tool only reads `~/.claude/projects` and `~/.codex/sessions`, and only talks to hitmylimit.com.

IP addresses are used for a daily rate limit only. They're stored as a salted hash and deleted the next day.
Individual reports are not published, only medians for groups of 20 or more.

## Change log

[/changes](https://hitmylimit.com/changes) lists limit changes, changes to how usage is shown, and free resets.
Feeds: `/rss.xml`, `/zh/rss.xml`, `/rss/anthropic.xml`, `/rss/openai.xml`, `/rss/google.xml`. Each item has one
`<category>`: `limit`, `display` or `reset`.

You can also sign up for email alerts on `/changes`. Addresses are kept private and used only for those alerts.

To suggest a change, open the [issue form](https://github.com/tmeng53/hit-my-limit/issues/new?template=change.yml).
A GitHub Action checks the source link and opens a pull request with the entry, and a maintainer reviews it.
Free resets from a maintainer, sourced from the lab's own site or X account, are merged right away since a reset
only matters for a few hours. Entries are Markdown files in `src/content/changes/`; the schema is in
`src/content.config.ts`.

## Run it locally

```sh
npm install
npm run dev     # http://localhost:4321
npm test
npm run build
```

The change log works without anything else. For reports, set `DATABASE_URL` to any Postgres database; tables are
created on first use (`src/lib/db.ts`). In development, `/?sample` shows made-up numbers.

Optional: `RESEND_API_KEY` adds alert sign-ups to a [Resend](https://resend.com) list (one segment per language,
`src/lib/resend.ts`). Without it, sign-ups are only saved to the database.

The site is Astro on Vercel: pages are static, and the API and data pages run as Vercel Functions. Page views use
Vercel Web Analytics, which sets no cookies.

## API

- `POST /api/reports` takes one report as JSON (validation in `src/lib/reports.ts`) and returns how it compares
  with recent reports on the same plan and limit. Limited to 20 a day per IP address.
- `POST /api/subscribe` takes an alert sign-up as a form post. Limited to 5 a day per IP address.

To hide a bad report: `update reports set hidden = true where id = ...`.

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

[MIT](LICENSE). Not affiliated with or endorsed by Anthropic, OpenAI or Google. Product and plan names are used only
to identify them.
