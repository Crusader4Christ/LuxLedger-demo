import assert from 'node:assert/strict';
import test from 'node:test';
import { migrationHistoryMatches, npmExecutable } from './migration-history.mjs';

test('accepts an exact or pending-prefix migration history', () => {
  assert.equal(migrationHistoryMatches(['a', 'b'], ['a', 'b']), true);
  assert.equal(migrationHistoryMatches(['a'], ['a', 'b']), true);
});

test('rejects a changed, reordered, or longer migration history', () => {
  assert.equal(migrationHistoryMatches(['a', 'x'], ['a', 'b']), false);
  assert.equal(migrationHistoryMatches(['b', 'a'], ['a', 'b']), false);
  assert.equal(migrationHistoryMatches(['a', 'b', 'c'], ['a', 'b']), false);
});

test('uses the Windows npm command shim when required', () => {
  assert.equal(npmExecutable('win32'), 'npm.cmd');
  assert.equal(npmExecutable('linux'), 'npm');
});
