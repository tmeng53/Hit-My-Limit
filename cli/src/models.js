// Tokens per model within a window, and the model that produced the most output.
export function modelBreakdown(usage, nameOf) {
  const models = {};
  for (const u of usage) {
    const name = nameOf(u.model);
    if (!name) continue;
    const m = (models[name] ??= { total: 0, output: 0 });
    m.total += u.input + u.output + u.cacheRead + (u.cacheWrite ?? 0);
    m.output += u.output;
  }
  const main = Object.entries(models).sort((a, b) => b[1].output - a[1].output)[0]?.[0] ?? null;
  return { models: Object.keys(models).length ? models : null, main };
}
