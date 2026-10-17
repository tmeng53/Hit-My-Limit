import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

// All .jsonl files under a directory changed since `since`, or [] if the directory doesn't exist.
export async function jsonlFiles(dir, since) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await jsonlFiles(path, since)));
    else if (e.isFile() && e.name.endsWith('.jsonl')) {
      const s = await stat(path).catch(() => null);
      if (s && s.mtimeMs >= since) out.push(path);
    }
  }
  return out;
}

// Calls fn with each parsed JSON line that contains `needle`. Lines that aren't JSON are skipped.
export async function eachLine(path, needle, fn) {
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes(needle)) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    fn(obj);
  }
}
