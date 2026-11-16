import { clampVolume } from './validation.js';
import { parseFsapiStatus, parseFsapiValue, parseModeList, type RadioMode } from './fsapiXml.js';

export interface RadioTarget {
  readonly host: string;
  readonly pin: string;
}

export type FsapiOp = 'GET' | 'SET' | 'LIST_GET_NEXT';

export function buildFsapiUrl(
  target: RadioTarget,
  op: FsapiOp,
  node: string,
  params: Readonly<Record<string, string | number>> = {}
): string {
  const queryParams = new URLSearchParams({ pin: target.pin });
  for (const [key, value] of Object.entries(params)) {
    queryParams.set(key, String(value));
  }
  const path = op === 'LIST_GET_NEXT' ? `${node}/-1` : node;
  return `http://${target.host}/fsapi/${op}/${path}?${queryParams.toString()}`;
}

export type HealthResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'timeout' | 'network' };

export async function checkHealth(
  target: RadioTarget,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 3000
): Promise<HealthResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    await fetchFn(buildFsapiUrl(target, 'GET', 'netRemote.sys.info.friendlyName'), {
      mode: 'no-cors',
      signal: controller.signal
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeout);
  }
}

export type ReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: 'timeout' | 'network' | 'pin' | 'fsapi'; readonly detail?: string };

async function readFsapiXml(
  target: RadioTarget,
  op: 'GET' | 'LIST_GET_NEXT',
  node: string,
  params: Readonly<Record<string, string | number>>,
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<ReadResult<string>> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchFn(buildFsapiUrl(target, op, node, params), { signal: controller.signal });
    if (response.status === 403) {
      return { ok: false, reason: 'pin', detail: 'HTTP 403' };
    }
    if (!response.ok) {
      return { ok: false, reason: 'fsapi', detail: `HTTP ${response.status}` };
    }

    const xml = await response.text();
    const status = parseFsapiStatus(xml);
    if (status === 'FS_PACKET_BAD') {
      return { ok: false, reason: 'pin', detail: status };
    }
    if (status !== 'FS_OK') {
      return { ok: false, reason: 'fsapi', detail: status ?? 'Malformed FSAPI response' };
    }
    return { ok: true, value: xml };
  } catch {
    return { ok: false, reason: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fsapiGetNumber(
  target: RadioTarget,
  node: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 3000
): Promise<ReadResult<number>> {
  const result = await readFsapiXml(target, 'GET', node, {}, fetchFn, timeoutMs);
  if (!result.ok) {
    return result;
  }
  const value = parseFsapiValue(result.value);
  return typeof value === 'number'
    ? { ok: true, value }
    : { ok: false, reason: 'fsapi', detail: 'FSAPI response did not contain a number' };
}

export async function getModes(target: RadioTarget, fetchFn: typeof fetch = fetch): Promise<ReadResult<RadioMode[]>> {
  const result = await readFsapiXml(
    target,
    'LIST_GET_NEXT',
    'netRemote.sys.caps.validModes',
    { maxItems: 100 },
    fetchFn,
    3000
  );
  return result.ok ? { ok: true, value: parseModeList(result.value) } : result;
}

async function sendFsapiSet(
  target: RadioTarget,
  node: string,
  value: number,
  fetchFn: typeof fetch
): Promise<boolean> {
  try {
    await fetchFn(buildFsapiUrl(target, 'SET', node, { value }), { mode: 'no-cors' });
    return true;
  } catch {
    return false;
  }
}

export function setPower(target: RadioTarget, on: boolean, fetchFn: typeof fetch = fetch): Promise<boolean> {
  return sendFsapiSet(target, 'netRemote.sys.power', on ? 1 : 0, fetchFn);
}

export function setMode(target: RadioTarget, key: number, fetchFn: typeof fetch = fetch): Promise<boolean> {
  return sendFsapiSet(target, 'netRemote.sys.mode', key, fetchFn);
}

export function setVolume(
  target: RadioTarget,
  level: number,
  fetchFn: typeof fetch = fetch,
  max = 20
): Promise<boolean> {
  return sendFsapiSet(target, 'netRemote.sys.audio.volume', clampVolume(level, max), fetchFn);
}