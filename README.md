# Hit My Limit

A public log of every change to AI subscription usage limits, and to how labs display them, with a date and a source.
Covers Anthropic (Claude, Claude Code), OpenAI (ChatGPT, Codex) and Google (Gemini, Gemini CLI). English at `/`, Chinese at `/zh/`.

## How entries get added

1. Anyone suggests a change through the [issue form](https://github.com/tmeng53/hit-my-limit/issues/new?template=change.yml).
2. A GitHub Action checks the source link and opens a pull request with the drafted entry.
   Sources from the labs or major press are marked confirmed; anything else is marked unconfirmed.
3. A maintainer reviews the pull request. Merging it publishes the entry.

Each entry is one Markdown file in `src/content/changes/`, frontmatter only. The schema is in `src/content.config.ts`.

## Feeds and alerts

- `/rss.xml` (English), `/zh/rss.xml` (Chinese), `/rss/anthropic.xml`, `/rss/openai.xml`, `/rss/google.xml`
- Email alerts through Buttondown (username set in `src/lib/site.ts`)

## Develop

```sh
npm install
npm run dev     # http://localhost:4321
npm run build   # static site in dist/
```

Deployed on Vercel as a static Astro site.

## License

Code: [MIT](LICENSE). Change log data: [CC BY 4.0](LICENSE-DATA.md).
