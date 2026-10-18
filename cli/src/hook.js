// The optional Claude Code hook. When a Claude Code turn stops on a usage limit, Claude Code runs
// `hitmylimit hook run`, which sends the report and shows a desktop notification. It is only added after the
// person says yes, and `hitmylimit hook off` removes it.
import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function claudeSettingsPath(env = process.env) {
  const root = env.CLAUDE_CONFIG_DIR?.split(',')[0]?.trim() || join(homedir(), '.claude');
  return join(root, 'settings.json');
}

const isOurs = (h) => typeof h?.command === 'string' && h.command.includes('hitmylimit');

// Our entry is the only one touched; everything else in the settings stays as it was.
export function removeHook(settings) {
  const s = structuredClone(settings ?? {});
  const groups = s.hooks?.StopFailure;
  if (!Array.isArray(groups)) return s;
  const left = groups
    .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !isOurs(h)) }))
    .filter((g) => g.hooks.length);
  if (left.length) s.hooks.StopFailure = left;
  else delete s.hooks.StopFailure;
  if (!Object.keys(s.hooks).length) delete s.hooks;
  return s;
}

export function addHook(settings, command) {
  const s = removeHook(settings);
  s.hooks ??= {};
  s.hooks.StopFailure ??= [];
  s.hooks.StopFailure.push({ matcher: 'rate_limit', hooks: [{ type: 'command', command, timeout: 30 }] });
  return s;
}

export function hasHook(settings) {
  return (settings?.hooks?.StopFailure ?? []).some((g) => (g.hooks ?? []).some(isOurs));
}

export async function readSettings(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return {};
  }
  try {
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Couldn't read ${path}, so it was left as is. Fix the file and try again.`);
  }
}

export async function writeSettings(path, settings) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.hitmylimit-tmp`;
  await writeFile(tmp, JSON.stringify(settings, null, 2) + '\n');
  await rename(tmp, path);
}

// The hook runs a copy of this tool kept next to its state, so it works offline and doesn't depend on npx's cache.
export async function installCopy(dir) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await mkdir(dir, { recursive: true });
  for (const part of ['bin', 'src', 'package.json']) await cp(join(root, part), join(dir, part), { recursive: true, force: true });
  return `node "${join(dir, 'bin', 'hitmylimit.js')}" hook run`;
}

// On a Mac the notification goes through macOS itself, which works in any terminal. Elsewhere it is an OSC 9
// sequence, which Claude Code writes to the terminal for the hook.
export async function notify({ title, subtitle = '', body = '' }, platform = process.platform) {
  if (platform === 'darwin') {
    const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}${subtitle ? ` subtitle ${JSON.stringify(subtitle)}` : ''}`;
    await new Promise((resolve) => {
      execFile('osascript', ['-e', script], { timeout: 5000 }, () => resolve());
    });
    return null;
  }
  const text = [title, subtitle, body].filter(Boolean).join('. ');
  return `\x1b]9;${text.replace(/[\x00-\x1f\x7f]/g, ' ')}\x07`;
}
