// Made-up numbers in the shape of the home page data, used to design the page before there are real reports.
import type { HomeData } from './home';

export const SAMPLE: HomeData = {
  sample: true,
  days: 30,
  reports: 1284,
  people: 412,
  plans: [
    { lab: 'anthropic', plan: 'pro', window: '5h', reports: 214, median: 95, p25: 60, p75: 140, prev: 120, tokens: 18_400_000, sooner: 58 },
    { lab: 'anthropic', plan: 'max-5x', window: '5h', reports: 187, median: 160, p25: 110, p75: 215, prev: 185, tokens: 61_000_000, sooner: 64 },
    { lab: 'anthropic', plan: 'max-20x', window: '5h', reports: 96, median: 230, p25: 175, p75: 280, prev: 225, tokens: 182_000_000, sooner: 41 },
    { lab: 'anthropic', plan: 'max-20x', window: 'weekly', reports: 41, median: 7020, p25: 5760, p75: 8640, prev: 8100, tokens: 1_900_000_000, sooner: 71 },
    { lab: 'openai', plan: 'plus', window: '5h', reports: 233, median: 70, p25: 35, p75: 125, prev: 75, tokens: 6_100_000, sooner: 47 },
    { lab: 'openai', plan: 'plus', window: 'weekly', reports: 118, median: 4800, p25: 3300, p75: 6900, prev: 4500, tokens: 52_000_000, sooner: 39 },
    { lab: 'openai', plan: 'pro-200', window: '5h', reports: 64, median: 210, p25: 150, p75: 265, prev: 205, tokens: 74_000_000, sooner: 33 },
    { lab: 'google', plan: 'ai-pro', window: 'daily', reports: 12, median: null, p25: null, p75: null, prev: null, tokens: null, sooner: null },
  ],
  models: [
    { lab: 'anthropic', shares: [['opus', 78], ['sonnet', 20], ['haiku', 2]] },
    { lab: 'openai', shares: [['gpt-5-codex', 64], ['gpt-5', 31], ['gpt-5-mini', 5]] },
  ],
  trend: {
    weeks: ['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'],
    labs: [
      { lab: 'anthropic', minutes: [152, 148, 153, 146, 149, 141, 138, 124, 121, 117, 112, 110] },
      { lab: 'openai', minutes: [82, 80, 84, 81, 79, 78, 80, 77, 76, 75, 77, 76] },
      { lab: 'google', minutes: [null, null, null, null, null, null, null, null, null, null, null, null] },
    ],
  },
  sooner: [
    { week: '2026-08-24', pct: 38, n: 61 },
    { week: '2026-08-31', pct: 41, n: 74 },
    { week: '2026-09-07', pct: 36, n: 88 },
    { week: '2026-09-14', pct: 44, n: 97 },
    { week: '2026-09-21', pct: 47, n: 120 },
    { week: '2026-09-28', pct: 52, n: 143 },
    { week: '2026-10-05', pct: 61, n: 171 },
    { week: '2026-10-12', pct: 63, n: 158 },
  ],
};
