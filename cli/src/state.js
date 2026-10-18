// A random contributor id and the list of reports already sent, kept in the user's config folder.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function statePath(env = process.env) {
  const base = env.XDG_CONFIG_HOME || (process.platform === 'win32' && env.APPDATA) || join(homedir(), '.config');
  return join(base, 'hitmylimit', 'state.json');
}

export async function loadState(path) {
  let s = {};
  try {
    s = JSON.parse(await readFile(path, 'utf8'));
  } catch {}
  return {
    client_id: typeof s.client_id === 'string' ? s.client_id : randomBytes(16).toString('hex'),
    sent: Array.isArray(s.sent) ? s.sent : [],
    plans: s.plans && typeof s.plans === 'object' ? s.plans : {},
    source: ['login', 'logs', 'manual'].includes(s.source) ? s.source : undefined,
    login_ok: s.login_ok === true,
    hook: s.hook === true,
    no_claude: s.no_claude === true,
    hook_offered: s.hook_offered === true,
    last_auto: s.last_auto && typeof s.last_auto === 'object' ? s.last_auto : null,
  };
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + '\n');
}

export function hitKey(c) {
  return `${c.lab}:${c.window}:${new Date(c.start).toISOString().slice(0, 16)}`;
}
