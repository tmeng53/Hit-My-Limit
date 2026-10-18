# Hit My Limit

Anonymous reports of when people hit AI usage limits, and a log of every change to those limits (and to how labs
display them) with a date and a source.
Covers Anthropic (Claude, Claude Code), OpenAI (ChatGPT, Codex) and Google (Gemini, Gemini CLI). English at `/`, Chinese at `/zh/`.

## Pages

- `/`: how long people last before the 5-hour limit, per plan. Weekly medians over the last 12 weeks (a week counts once it
  has 10 reports), a was → now row per plan, and a chart with one plan per lab. Plans under 20 reports show as pending.
  In development, `/?sample` shows made-up numbers from `src/lib/sample.ts`.
- `/limits`: medians, middle half and change against 12 weeks earlier for every plan and limit.
- `/changes`: the change log. `/share`: the report form.

## How entries get added

1. Anyone suggests a change through the [issue form](https://github.com/tmeng53/hit-my-limit/issues/new?template=change.yml).
2. A GitHub Action checks the source link, builds the site with the drafted entry, and opens a pull request.
   If the build fails, it comments on the issue instead.
   Sources from the labs or major press are marked confirmed; anything else is marked unconfirmed.
3. A maintainer reviews the pull request. Merging it publishes the entry.
   Free limit resets are the exception: when the source is the lab's own site or official X account,
   the pull request is merged right away, because a reset is only useful for a few hours.

Each entry is one Markdown file in `src/content/changes/`, frontmatter only. The schema is in `src/content.config.ts`.

## Feeds and alerts

- `/rss.xml` (English), `/zh/rss.xml` (Chinese), `/rss/anthropic.xml`, `/rss/openai.xml`, `/rss/google.xml`
- Email alerts through Buttondown (username set in `src/lib/site.ts`)
- Each feed item has one `<category>`: `limit`, `display` or `reset`. `reset` means a lab reset limits early for free;
  the Mac app shows those as their own notification.

## Usage reports

People share when they hit a limit through the form at `/share` or the command-line tool in [`cli/`](cli/)
(`npx hitmylimit`, reads local Claude Code and Codex logs). `/limits` shows medians per plan and limit over the
last 30 days, once a group has 20 reports. Reports from shared and resold accounts are shown separately.

A report holds lab, product, plan, which limit, the date, minutes from window start to the limit (rounded to 5),
kind of work, account type, the UTC hour the window started, and optionally model, token counts per model,
number of requests, weekly limit use and tool version. It does not hold prompts, code,
account details, time zone or IP address. IP addresses are used only for a daily rate limit, stored as a salted
hash and deleted the next day. The contributor id is random and hashed before it is stored.

- `POST /api/reports` takes one report as JSON. Validation is in `src/lib/reports.ts`.
  The response includes `comparison`: how many other recent reports on the same plan and limit lasted longer
  (`percent`, `n`). Once the group has 20 reports it also has `median_minutes` and a histogram of minutes to
  the limit: `bin_minutes` (15 for 5h, 60 daily, 360 weekly, 1440 monthly) and `bins`, counts from 0 to the window length.
- Storage is Postgres (`DATABASE_URL` or `POSTGRES_URL`). Tables are created on first use; see `src/lib/db.ts`.
- To remove a bad report: `update reports set hidden = true where id = ...`.

## Develop

```sh
npm install
npm run dev     # http://localhost:4321
npm test        # report validation and command-line tool tests
npm run build
```

Without `DATABASE_URL`, the change log works and the report pages say reports are not open yet. To try reports
locally, point `DATABASE_URL` at any Postgres database.

Deployed on Vercel: pages are static, and the report API and the data pages run as Vercel Functions.

## License

Code: [MIT](LICENSE).

Not affiliated with or endorsed by Anthropic, OpenAI or Google. Product and plan names are used only to identify them.
