export const navCapsPresets = 0x2;
export const navCapsEditPresets = 0x4;

export function presetCapabilities(caps: number): { readonly supported: boolean; readonly editable: boolean } {
  return {
    supported: (caps & navCapsPresets) !== 0,
    editable: (caps & navCapsEditPresets) !== 0
  };
}

export type PresetInputResult =
  | { readonly ok: true; readonly name: string; readonly url: string }
  | { readonly ok: false; readonly error: string };

export function validatePresetInput(name: string, url: string): PresetInputResult {
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return { ok: false, error: 'Name is required.' };
  }
  if (trimmedName.length > 128) {
    return { ok: false, error: 'Name must be 128 characters or fewer.' };
  }

  const trimmedUrl = url.trim();
  try {
    const parsedUrl = new URL(trimmedUrl);
    if ((parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') || parsedUrl.hostname === '') {
      return { ok: false, error: 'URL must be an http or https URL.' };
    }
  } catch {
    return { ok: false, error: 'Enter a valid http or https URL.' };
  }

  return { ok: true, name: trimmedName, url: trimmedUrl };
}

export interface PresetContext {
  readonly target: string;
  readonly power: boolean | null;
  readonly modeKey: number | null;
}

export function shouldReloadPresets(previous: PresetContext | null, next: PresetContext): boolean {
  return next.power === true && (
    previous === null
    || previous.target !== next.target
    || previous.power !== true
    || previous.modeKey !== next.modeKey
  );
}

export function shortenUrl(url: string, max = 48): string {
  const limit = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 48;
  if (url.length <= limit) {
    return url;
  }
  if (limit === 0) {
    return '';
  }
  if (limit === 1) {
    return '…';
  }

  const visibleLength = limit - 1;
  const startLength = Math.ceil(visibleLength / 2);
  const endLength = visibleLength - startLength;
  return `${url.slice(0, startLength)}…${endLength > 0 ? url.slice(-endLength) : ''}`;
}