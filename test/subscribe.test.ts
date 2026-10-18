import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseEmail } from '../src/lib/email.ts';
import { buildEmail, parseEntry } from '../scripts/alert-email.mjs';

test('accepts and normalizes email addresses', () => {
  assert.equal(parseEmail('  Me@Example.COM '), 'me@example.com');
  assert.equal(parseEmail('a.b+tag@sub.example.co'), 'a.b+tag@sub.example.co');
});

test('rejects things that are not email addresses', () => {
  for (const bad of ['', 'me', 'me@', '@example.com', 'me@example', 'a b@example.com', 'a@b.c', '<a@b.com>', 'a@b.com, c@d.com', 42, null]) {
    assert.equal(parseEmail(bad), null, String(bad));
  }
  assert.equal(parseEmail(`${'a'.repeat(250)}@b.com`), null);
});

test('builds the alert email in each language with an unsubscribe link', () => {
  const id = '2026-10-16-google-google-resets-gemini-and-argon-quotas';
  const entry = parseEntry(readFileSync(`src/content/changes/${id}.md`, 'utf8'));
  assert.equal(entry.lab, 'google');
  const en = buildEmail(id, entry, 'en', 'tok');
  assert.equal(en.subject, 'Google resets Gemini and Argon quotas');
  assert.match(en.text, /https:\/\/hitmylimit\.com\/changes#2026-10-16-google/);
  assert.equal(en.headers['List-Unsubscribe'], '<https://hitmylimit.com/unsubscribe?t=tok>');
  const zh = buildEmail(id, entry, 'zh', 'tok');
  assert.equal(zh.subject, 'Google 重置 Gemini 和 Argon 额度');
  assert.match(zh.text, /\/zh\/changes#/);
  assert.match(zh.text, /退订/);
});
