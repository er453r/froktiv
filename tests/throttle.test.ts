import assert from 'node:assert/strict';
import { test } from 'node:test';
import { throttleTrailing } from '../src/throttle.ts';

test('throttles rapid calls and sends the final value', async () => {
  const values: number[] = [];
  const throttled = throttleTrailing((value: number) => values.push(value), 30);

  throttled(1);
  throttled(2);
  throttled(3);
  assert.deepEqual(values, [1]);

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(values, [1, 3]);
});