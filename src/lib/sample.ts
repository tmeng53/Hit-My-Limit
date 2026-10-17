// Made-up numbers in the shape of the home page data, used to design the page before there are real reports.
import type { HomeData } from './home';

export const SAMPLE: HomeData = {
  sample: true,
  days: 30,
  reports: 1284,
  people: 412,
  weeks: ['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'],
  plans: [
    { lab: 'anthropic', plan: 'pro', reports: 214, minutes: [120, 118, 121, 116, 117, 111, 108, 101, 99, 97, 96, 95] },
    { lab: 'anthropic', plan: 'max-5x', reports: 187, minutes: [185, 183, 186, 180, 178, 174, 170, 166, 163, 162, 161, 160] },
    { lab: 'anthropic', plan: 'max-20x', reports: 96, minutes: [225, 228, 224, 226, 229, 227, 230, 228, 231, 229, 230, 230] },
    { lab: 'openai', plan: 'plus', reports: 233, minutes: [75, 74, 76, 74, 73, 72, 73, 71, 70, 70, 71, 70] },
    { lab: 'openai', plan: 'pro-200', reports: 64, minutes: [205, 207, 204, 206, 203, 208, 205, 207, 206, 209, 208, 210] },
    { lab: 'google', plan: 'ai-pro', reports: 12, minutes: [null, null, null, null, null, null, null, null, null, null, null, null] },
  ],
};
