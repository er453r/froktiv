import { checkHealth, fsapiGetNumber, type RadioTarget } from './fsapi.js';

export type RadioStatus =
  | { readonly kind: 'online'; readonly power: boolean; readonly modeKey: number | null; readonly volume: number | null }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'pin-rejected' }
  | { readonly kind: 'offline'; readonly reason: 'timeout' | 'network' };

export async function getRadioStatus(target: RadioTarget, fetchFn: typeof fetch = fetch): Promise<RadioStatus> {
  const powerResult = await fsapiGetNumber(target, 'netRemote.sys.power', fetchFn);
  if (!powerResult.ok) {
    if (powerResult.reason === 'pin') {
      return { kind: 'pin-rejected' };
    }
    if (powerResult.reason === 'timeout' || powerResult.reason === 'network') {
      const probe = await checkHealth(target, fetchFn);
      return probe.ok ? { kind: 'unreadable' } : { kind: 'offline', reason: probe.reason };
    }
    return { kind: 'offline', reason: 'network' };
  }

  const modeResult = await fsapiGetNumber(target, 'netRemote.sys.mode', fetchFn);
  const volumeResult = await fsapiGetNumber(target, 'netRemote.sys.audio.volume', fetchFn);

  return {
    kind: 'online',
    power: powerResult.value !== 0,
    modeKey: modeResult.ok ? modeResult.value : null,
    volume: volumeResult.ok ? volumeResult.value : null
  };
}