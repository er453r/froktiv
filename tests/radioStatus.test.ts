import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRadioStatus } from '../src/radioStatus.ts';
import type { RadioTarget } from '../src/fsapi.ts';

const target: RadioTarget = { host: '192.168.1.5', pin: '1234' };

test('reads power, mode and volume sequentially for an online radio', async () => {
  const requestedNodes: string[] = [];
  const fetchMock: typeof fetch = async (input) => {
    const url = String(input);
    const node = url.split('/fsapi/GET/')[1]?.split('?')[0] ?? '';
    requestedNodes.push(node);
    const value = node.endsWith('.power') ? 1 : node.endsWith('.mode') ? 7 : 18;
    return new Response(`<fsapiResponse><status>FS_OK</status><value><u8>${value}</u8></value></fsapiResponse>`);
  };

  assert.deepEqual(await getRadioStatus(target, fetchMock), {
    kind: 'online',
    power: true,
    modeKey: 7,
    volume: 18
  });
  assert.deepEqual(requestedNodes, [
    'netRemote.sys.power',
    'netRemote.sys.mode',
    'netRemote.sys.audio.volume'
  ]);
});

test('keeps an online result when optional mode or volume details fail', async () => {
  const fetchMock: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('netRemote.sys.power')) {
      return new Response('<fsapiResponse><status>FS_OK</status><value><u8>0</u8></value></fsapiResponse>');
    }
    if (url.includes('netRemote.sys.mode')) {
      return new Response('<fsapiResponse><status>FS_NODE_DOES_NOT_EXIST</status></fsapiResponse>');
    }
    throw new Error('volume network error');
  };

  assert.deepEqual(await getRadioStatus(target, fetchMock), {
    kind: 'online',
    power: false,
    modeKey: null,
    volume: null
  });
});

test('reports PIN rejection without issuing later requests', async () => {
  let requestCount = 0;
  const fetchMock: typeof fetch = async () => {
    requestCount += 1;
    return new Response('<fsapiResponse><status>FS_PACKET_BAD</status></fsapiResponse>');
  };

  assert.deepEqual(await getRadioStatus(target, fetchMock), { kind: 'pin-rejected' });
  assert.equal(requestCount, 1);
});

test('uses a no-cors probe to distinguish unreadable from offline', async () => {
  let requestModes: (RequestMode | undefined)[] = [];
  const reachableFetch: typeof fetch = async (_input, init) => {
    requestModes.push(init?.mode);
    if (init?.mode !== 'no-cors') {
      throw new TypeError('CORS failure');
    }
    return new Response();
  };
  assert.deepEqual(await getRadioStatus(target, reachableFetch), { kind: 'unreadable' });
  assert.deepEqual(requestModes, [undefined, 'no-cors']);

  requestModes = [];
  const offlineFetch: typeof fetch = async (_input, init) => {
    requestModes.push(init?.mode);
    throw new TypeError('network failure');
  };
  assert.deepEqual(await getRadioStatus(target, offlineFetch), { kind: 'offline', reason: 'network' });
  assert.deepEqual(requestModes, [undefined, 'no-cors']);
});