import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPoller } from '../src/poller.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('starts immediately and repeats at the requested interval', async () => {
  let calls = 0;
  const poller = createPoller(async () => { calls += 1; }, 15);

  poller.start();
  assert.equal(poller.running, true);
  assert.equal(calls, 1);
  await delay(38);
  poller.stop();

  assert.ok(calls >= 3);
  assert.equal(poller.running, false);
});

test('skips interval ticks while a task is in flight and never overlaps', async () => {
  let calls = 0;
  let activeTasks = 0;
  let maximumActiveTasks = 0;
  let releaseTask: (() => void) | undefined;
  const poller = createPoller(() => {
    calls += 1;
    activeTasks += 1;
    maximumActiveTasks = Math.max(maximumActiveTasks, activeTasks);
    return new Promise<void>((resolve) => {
      releaseTask = () => {
        activeTasks -= 1;
        resolve();
      };
    });
  }, 10);

  poller.start();
  await delay(35);
  assert.equal(calls, 1);
  releaseTask?.();
  await delay(15);
  poller.stop();

  assert.equal(maximumActiveTasks, 1);
  assert.equal(calls, 2);
});

test('stop prevents future runs and triggerNow runs immediately without restarting the timer', async () => {
  let calls = 0;
  const poller = createPoller(async () => { calls += 1; }, 100);

  poller.start();
  poller.triggerNow();
  await delay(0);
  assert.equal(calls, 2);
  await delay(10);
  assert.equal(calls, 2);
  poller.stop();
  await delay(110);
  assert.equal(calls, 2);
});

test('triggerNow performs one check while polling is paused without resuming the interval', async () => {
  let calls = 0;
  const poller = createPoller(async () => { calls += 1; }, 15);

  poller.start();
  await delay(0);
  poller.stop();
  const callsWhenPaused = calls;
  poller.triggerNow();
  await delay(0);

  assert.equal(poller.running, false);
  assert.equal(calls, callsWhenPaused + 1);
  await delay(25);
  assert.equal(calls, callsWhenPaused + 1);
});