import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addHook, hasHook, notify, removeHook } from '../src/hook.js';

const theirs = { type: 'command', command: 'say done' };

test('addHook keeps other settings and hooks, and replaces an older copy of ours', () => {
  const before = { model: 'opus', hooks: { Stop: [{ hooks: [theirs] }], StopFailure: [{ matcher: '*', hooks: [theirs] }] } };
  const once = addHook(before, 'node "/x/hitmylimit.js" hook run');
  const twice = addHook(once, 'node "/y/hitmylimit.js" hook run');
  assert.equal(twice.model, 'opus');
  assert.deepEqual(twice.hooks.Stop, before.hooks.Stop);
  assert.equal(twice.hooks.StopFailure.length, 2);
  assert.deepEqual(twice.hooks.StopFailure[1], { matcher: 'rate_limit', hooks: [{ type: 'command', command: 'node "/y/hitmylimit.js" hook run', timeout: 30 }] });
  assert.ok(hasHook(twice));
  assert.equal(before.hooks.StopFailure.length, 1, 'input is not changed');
});

test('removeHook takes out only ours and tidies empty sections', () => {
  const on = addHook({}, 'node "/x/hitmylimit.js" hook run');
  assert.deepEqual(removeHook(on), {});
  const mixed = addHook({ hooks: { StopFailure: [{ matcher: '*', hooks: [theirs] }] } }, 'hitmylimit hook run');
  assert.deepEqual(removeHook(mixed), { hooks: { StopFailure: [{ matcher: '*', hooks: [theirs] }] } });
  assert.ok(!hasHook(removeHook(mixed)));
});

test('notify returns an OSC 9 sequence off macOS, without control characters in the text', async () => {
  const seq = await notify({ title: 'Claude Pro: out after 3h', subtitle: 'First time this week', body: 'line\none' }, 'linux');
  assert.equal(seq, '\x1b]9;Claude Pro: out after 3h. First time this week. line one\x07');
});
