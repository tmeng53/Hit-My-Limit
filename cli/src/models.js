// Tokens per model within a window, and the model that produced the most output.
// Reasoning tokens (Codex only) are part of output, so they don't add to the total.
export function modelBreakdown(usage, nameOf) {
  const models = {};
  for (const u of usage) {
    const name = nameOf(u.model);
    if (!name) continue;
    const m = (models[name] ??= { total: 0, input: 0, output: 0, cache_read: 0, cache_write: 0 });
    m.input += u.input;
    m.output += u.output;
    m.cache_read += u.cacheRead;
    m.cache_write += u.cacheWrite ?? 0;
    m.total = m.input + m.output + m.cache_read + m.cache_write;
    if (u.reasoning !== undefined) m.reasoning = (m.reasoning ?? 0) + u.reasoning;
  }
  const main = Object.entries(models).sort((a, b) => b[1].output - a[1].output)[0]?.[0] ?? null;
  return { models: Object.keys(models).length ? models : null, main };
}

// Window facts shared by both readers: tokens, number of model responses, and the UTC hour the window started.
export function windowSummary(c, usage, nameOf) {
  const inWindow = usage.filter((u) => u.time >= c.start && u.time <= c.hit);
  const sum = (k) => inWindow.reduce((n, u) => n + (u[k] ?? 0), 0);
  const { models, main } = modelBreakdown(inWindow, nameOf);
  const tokens = { input: sum('input'), output: sum('output'), cache_read: sum('cacheRead'), cache_write: sum('cacheWrite') };
  tokens.total = tokens.input + tokens.output + tokens.cache_read + tokens.cache_write;
  if (inWindow.some((u) => u.reasoning !== undefined)) tokens.reasoning = sum('reasoning');
  return {
    model: main,
    models,
    tokens: inWindow.length ? tokens : null,
    requests: inWindow.length || null,
    start_hour: new Date(c.start).getUTCHours(),
    tool_version: c.version ?? inWindow.at(-1)?.version ?? null,
  };
}
