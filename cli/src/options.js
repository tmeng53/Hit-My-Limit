// A copy of the site's lists (src/lib/reports.ts). The server checks every report against its own copy.
export const PLANS = {
  anthropic: [['free', 'Free'], ['pro', 'Pro'], ['max-5x', 'Max 5x'], ['max-20x', 'Max 20x'], ['team', 'Team'], ['enterprise', 'Enterprise'], ['other', 'Other']],
  openai: [['free', 'Free'], ['go', 'Go'], ['plus', 'Plus'], ['pro-100', 'Pro 100'], ['pro-200', 'Pro 200'], ['pro-500', 'Pro 500'], ['business', 'Business'], ['enterprise', 'Enterprise'], ['other', 'Other']],
  google: [['free', 'Free'], ['ai-plus', 'AI Plus'], ['ai-pro', 'AI Pro'], ['ai-ultra', 'AI Ultra'], ['other', 'Other']],
};
export const WORK = [['coding', 'coding'], ['chat', 'chat'], ['research', 'research'], ['other', 'other']];
export const ACCOUNTS = [
  ['own', 'my own (paid directly, or a work seat)'],
  ['shared', 'shared with other people'],
  ['reseller', 'bought from a reseller'],
];
export const FELT = [
  ['skip', 'skip'],
  ['sooner', 'sooner than usual'],
  ['usual', 'about the same as usual'],
  ['later', 'later than usual'],
];
export const PRODUCT_NAMES = {
  'claude-code': 'Claude Code', 'claude-app': 'Claude', codex: 'Codex', chatgpt: 'ChatGPT', 'gemini-app': 'Gemini', 'gemini-cli': 'Gemini CLI',
};
export const WINDOW_NAMES = { '5h': '5-hour', daily: 'daily', weekly: 'weekly', monthly: 'monthly' };
