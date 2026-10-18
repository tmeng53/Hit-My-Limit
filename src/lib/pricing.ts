// Turns the tokens in a report into one number: what they would cost at the labs' public API prices.
// Labs don't say how big a plan is, but they meter something cost-like, so this is the closest outside
// measure of how much a plan gives before the limit. A raw token total would be mostly cache reads, which
// cost a tenth of normal input, and an Opus token costs more than a Sonnet one.
//
// The prices are a fixed yardstick, not what anyone paid: they stay the same across weeks so a drop means the
// limit changed, not the price list. Update them only when a lab changes its list prices, and say so in the
// change log, since every week's numbers move with them.

// US dollars per million tokens.
interface Price {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}

// Claude Code logs only the family (opus, sonnet, haiku), so each family uses its newest model's price:
// Opus 5.5, Sonnet 5.5, Haiku 5.5 (prompts up to 100K tokens). Cache writes use the 5-minute rate.
// Source: https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-10-18)
const CLAUDE: Record<string, Price> = {
  opus: { input: 4, output: 20, cache_read: 0.2, cache_write: 5 },
  sonnet: { input: 2, output: 10, cache_read: 0.1, cache_write: 2.5 },
  haiku: { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 },
};
// Codex logs full model names. OpenAI doesn't charge for cache writes.
// Source: https://developers.openai.com/api/docs/pricing, Standard tier, short context (checked 2026-10-18)
const OPENAI: Record<string, Price> = {
  astra: { input: 10, output: 50, cache_read: 1, cache_write: 0 }, // gpt-6-astra
  sol: { input: 2, output: 10, cache_read: 0.1, cache_write: 0 }, // gpt-6.1-sol
  luna: { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0 }, // gpt-6-luna
  'sol-5.6': { input: 4, output: 20, cache_read: 0.4, cache_write: 0 }, // gpt-5.6-sol
  codex: { input: 1.75, output: 14, cache_read: 0.175, cache_write: 0 }, // gpt-5.3-codex
};

function openaiPrice(m: string): Price {
  if (m.includes('astra')) return OPENAI.astra;
  if (/luna|mini|nano/.test(m)) return OPENAI.luna;
  if (m.includes('5.6')) return OPENAI['sol-5.6'];
  if (m.startsWith('gpt-5') && m.includes('codex')) return OPENAI.codex;
  // GPT-6 Sol and anything new or unknown.
  return OPENAI.sol;
}

export function priceFor(lab: string, model: string | null): Price | null {
  const m = (model ?? '').toLowerCase();
  if (lab === 'anthropic') return CLAUDE[Object.keys(CLAUDE).find((f) => m.includes(f)) ?? 'sonnet'];
  if (lab === 'openai') return openaiPrice(m);
  return null;
}

interface Tokens {
  input?: number | null;
  output?: number | null;
  cache_read?: number | null;
  cache_write?: number | null;
}

const cost = (p: Price, t: Tokens) =>
  ((t.input ?? 0) * p.input + (t.output ?? 0) * p.output + (t.cache_read ?? 0) * p.cache_read + (t.cache_write ?? 0) * p.cache_write) / 1e6;

// API-price value of a report's tokens in US dollars, or null when the report has no token counts.
// Uses the per-model breakdown when there is one, otherwise the totals priced as the report's main model.
export function apiValue(r: {
  lab: string;
  model: string | null;
  models: Record<string, Tokens> | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_cache_read: number | null;
  tokens_cache_write: number | null;
}): number | null {
  if (r.models && Object.keys(r.models).length) {
    let sum = 0;
    for (const [name, t] of Object.entries(r.models)) {
      const p = priceFor(r.lab, name);
      if (!p) return null;
      sum += cost(p, t);
    }
    return sum;
  }
  if (r.tokens_input === null && r.tokens_output === null) return null;
  const p = priceFor(r.lab, r.model);
  if (!p) return null;
  return cost(p, { input: r.tokens_input, output: r.tokens_output, cache_read: r.tokens_cache_read, cache_write: r.tokens_cache_write });
}
