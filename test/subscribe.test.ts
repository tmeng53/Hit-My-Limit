import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEmail } from '../src/lib/email.ts';

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
