import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildFsapiUrl,
  checkHealth,
  fsapiGetNumber,
  getModes,
  setMode,
  setPower,
  setVolume,
  type RadioTarget
} from '../src/fsapi.ts';

const target: RadioTarget = { host: '192.168.1.5:80', pin: '12 34&' };

test('builds FSAPI GET, SET and LIST_GET_NEXT URLs with an encoded PIN', () => {
  assert.equal(
    buildFsapiUrl(target, 'GET', 'netRemote.sys.info.friendlyName'),
    'http://192.168.1.5:80/fsapi/GET/netRemote.sys.info.friendlyName?pin=12+34%26'
  );
  assert.equal(
    buildFsapiUrl(target, 'SET', 'netRemote.sys.audio.volume', { value: 9 }),
    'http://192.168.1.5:80/fsapi/SET/netRemote.sys.audio.volume?pin=12+34%26&value=9'
  );
  assert.equal(
    buildFsapiUrl(target, 'LIST_GET_NEXT', 'netRemote.sys.caps.validModes', { maxItems: 100 }),
    'http://192.168.1.5:80/fsapi/LIST_GET_NEXT/netRemote.sys.caps.validModes/-1?pin=12+34%26&maxItems=100'
  );
});

test('reports health when the no-cors request resolves', async () => {
  let requestUrl = '';
  let requestMode: RequestMode | undefined;
  const fetchMock: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestMode = init?.mode;
    return new Response();
  };

  assert.deepEqual(await checkHealth(target, fetchMock), { ok: true });
  assert.equal(requestUrl, 'http://192.168.1.5:80/fsapi/GET/netRemote.sys.info.friendlyName?pin=12+34%26');
  assert.equal(requestMode, 'no-cors');
});

test('reports a network failure when the health request rejects', async () => {
  const fetchMock: typeof fetch = async () => {
    throw new Error('network error');
  };
  assert.deepEqual(await checkHealth(target, fetchMock), { ok: false, reason: 'network' });
});

test('reports a timeout when the health request is aborted', async () => {
  const fetchMock: typeof fetch = async (_input, init) => await new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (signal === undefined || signal === null) {
      reject(new Error('missing abort signal'));
      return;
    }
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });

  assert.deepEqual(await checkHealth(target, fetchMock, 10), { ok: false, reason: 'timeout' });
});

test('clamps volume and sends it using no-cors', async () => {
  let requestUrl = '';
  let requestMode: RequestMode | undefined;
  const fetchMock: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestMode = init?.mode;
    return new Response();
  };

  assert.equal(await setVolume(target, 25, fetchMock), true);
  assert.equal(requestUrl, 'http://192.168.1.5:80/fsapi/SET/netRemote.sys.audio.volume?pin=12+34%26&value=20');
  assert.equal(requestMode, 'no-cors');
});

test('reports when sending volume fails', async () => {
  const fetchMock: typeof fetch = async () => {
    throw new Error('network error');
  };
  assert.equal(await setVolume(target, 6, fetchMock), false);
});

test('reads an FSAPI number from XML and sends a readable GET', async () => {
  let requestUrl = '';
  let requestMode: RequestMode | undefined;
  const fetchMock: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestMode = init?.mode;
    return new Response('<fsapiResponse><status>FS_OK</status><value><u8>17</u8></value></fsapiResponse>');
  };

  assert.deepEqual(await fsapiGetNumber(target, 'netRemote.sys.audio.volume', fetchMock), { ok: true, value: 17 });
  assert.equal(requestUrl, 'http://192.168.1.5:80/fsapi/GET/netRemote.sys.audio.volume?pin=12+34%26');
  assert.equal(requestMode, undefined);
});

test('maps HTTP 403 and FS_PACKET_BAD to PIN failures', async () => {
  const forbiddenFetch: typeof fetch = async () => new Response(null, { status: 403 });
  const badPinFetch: typeof fetch = async () => new Response('<fsapiResponse><status>FS_PACKET_BAD</status></fsapiResponse>');

  assert.deepEqual(await fsapiGetNumber(target, 'netRemote.sys.power', forbiddenFetch), {
    ok: false,
    reason: 'pin',
    detail: 'HTTP 403'
  });
  assert.deepEqual(await fsapiGetNumber(target, 'netRemote.sys.power', badPinFetch), {
    ok: false,
    reason: 'pin',
    detail: 'FS_PACKET_BAD'
  });
});

test('classifies FSAPI errors, malformed replies, network failures and timeouts', async () => {
  const fsapiFetch: typeof fetch = async () => new Response('<fsapiResponse><status>FS_NODE_DOES_NOT_EXIST</status></fsapiResponse>');
  const malformedFetch: typeof fetch = async () => new Response('<notFsapi/>');
  const networkFetch: typeof fetch = async () => { throw new Error('network error'); };
  const timeoutFetch: typeof fetch = async (_input, init) => await new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });

  assert.deepEqual(await fsapiGetNumber(target, 'missing.node', fsapiFetch), {
    ok: false,
    reason: 'fsapi',
    detail: 'FS_NODE_DOES_NOT_EXIST'
  });
  assert.deepEqual(await fsapiGetNumber(target, 'missing.value', malformedFetch), {
    ok: false,
    reason: 'fsapi',
    detail: 'Malformed FSAPI response'
  });
  assert.deepEqual(await fsapiGetNumber(target, 'node', networkFetch), { ok: false, reason: 'network' });
  assert.deepEqual(await fsapiGetNumber(target, 'node', timeoutFetch, 10), { ok: false, reason: 'timeout' });
});

test('reads the radio mode list and sends power and mode using no-cors', async () => {
  let requestUrl = '';
  const modeFetch: typeof fetch = async (input) => {
    requestUrl = String(input);
    return new Response('<fsapiResponse><status>FS_OK</status><items><item key="4"><field name="id"><c8_array>DAB</c8_array></field><field name="label"><c8_array>Digital Radio</c8_array></field><field name="selectable"><u8>1</u8></field></item></items></fsapiResponse>');
  };
  assert.deepEqual(await getModes(target, modeFetch), {
    ok: true,
    value: [{ key: 4, id: 'DAB', label: 'Digital Radio', selectable: true }]
  });
  assert.equal(requestUrl, 'http://192.168.1.5:80/fsapi/LIST_GET_NEXT/netRemote.sys.caps.validModes/-1?pin=12+34%26&maxItems=100');

  const requests: { url: string; mode: RequestMode | undefined }[] = [];
  const setFetch: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), mode: init?.mode });
    return new Response();
  };
  assert.equal(await setPower(target, true, setFetch), true);
  assert.equal(await setPower(target, false, setFetch), true);
  assert.equal(await setMode(target, 4, setFetch), true);
  assert.deepEqual(requests, [
    { url: 'http://192.168.1.5:80/fsapi/SET/netRemote.sys.power?pin=12+34%26&value=1', mode: 'no-cors' },
    { url: 'http://192.168.1.5:80/fsapi/SET/netRemote.sys.power?pin=12+34%26&value=0', mode: 'no-cors' },
    { url: 'http://192.168.1.5:80/fsapi/SET/netRemote.sys.mode?pin=12+34%26&value=4', mode: 'no-cors' }
  ]);
});

test('sets volume using a custom maximum', async () => {
  let requestUrl = '';
  const fetchMock: typeof fetch = async (input) => {
    requestUrl = String(input);
    return new Response();
  };

  assert.equal(await setVolume(target, 25, fetchMock, 31), true);
  assert.equal(requestUrl, 'http://192.168.1.5:80/fsapi/SET/netRemote.sys.audio.volume?pin=12+34%26&value=25');
});