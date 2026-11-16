import {
  fsapiGetNumber,
  getModes,
  setMode,
  setPower,
  setVolume,
  type RadioTarget
} from './fsapi.js';
import type { RadioMode } from './fsapiXml.js';
import { getRadioStatus, type RadioStatus } from './radioStatus.js';
import { createPoller } from './poller.js';
import { clampVolume, isValidHost } from './validation.js';
import { hostStorageKey, pinStorageKey, readStoredValue, saveStoredValue, type KeyValueStore } from './storage.js';
import { throttleTrailing } from './throttle.js';
import { canRegisterServiceWorker } from './pwa.js';

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Missing required page element: ${selector}`);
  }
  return element;
}

const hostInput = requireElement<HTMLInputElement>('#radio-ip');
const pinInput = requireElement<HTMLInputElement>('#radio-pin');
const pollToggle = requireElement<HTMLButtonElement>('#poll-toggle');
const powerToggle = requireElement<HTMLButtonElement>('#power-toggle');
const powerOnButton = requireElement<HTMLButtonElement>('#power-on');
const powerOffButton = requireElement<HTMLButtonElement>('#power-off');
const modeSelect = requireElement<HTMLSelectElement>('#mode-select');
const modeFallback = requireElement<HTMLDivElement>('#mode-fallback');
const modeNumber = requireElement<HTMLInputElement>('#mode-number');
const modeSetButton = requireElement<HTMLButtonElement>('#mode-set');
const volumeSlider = requireElement<HTMLInputElement>('#volume-slider');
const volumeValue = requireElement<HTMLOutputElement>('#volume-value');
const status = requireElement<HTMLParagraphElement>('#status');
const powerStatus = requireElement<HTMLSpanElement>('#power-status');
const modeStatus = requireElement<HTMLSpanElement>('#mode-status');
const radioVolumeStatus = requireElement<HTMLSpanElement>('#radio-volume-status');
const lastChecked = requireElement<HTMLSpanElement>('#last-checked');

let statusVersion = 0;
let lastVolumeInputAt = Number.NEGATIVE_INFINITY;
let maxVolume = 20;
const attemptedVolumeStepsHosts = new Set<string>();
const volumeStepsByHost = new Map<string, number>();
let powerState: boolean | null = null;
let currentModeKey: number | null = null;
let currentVolume: number | null = null;
let modesHost = '';
let modeListRequestedFor: string | null = null;
let radioModes: RadioMode[] = [];
let selectableModes: RadioMode[] = [];

function getStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = getStorage();
const storedHost = readStoredValue(storage, hostStorageKey);
if (storedHost !== null) {
  hostInput.value = storedHost;
}

const storedPin = readStoredValue(storage, pinStorageKey);
if (storedPin !== null) {
  pinInput.value = storedPin;
}
modesHost = hostInput.value.trim();

function getTarget(): RadioTarget {
  return { host: hostInput.value.trim(), pin: pinInput.value };
}

function clearStatusDetails(): void {
  powerStatus.textContent = 'Unknown';
  modeStatus.textContent = 'Unknown';
  radioVolumeStatus.textContent = 'Unknown';
}

function updatePowerControls(): void {
  const enabled = isValidHost(hostInput.value);
  powerToggle.disabled = !enabled;
  powerOnButton.disabled = !enabled;
  powerOffButton.disabled = !enabled;
  powerToggle.hidden = powerState === null;
  powerToggle.textContent = powerState ? 'Turn off' : 'Turn on';
  powerOnButton.hidden = powerState !== null;
  powerOffButton.hidden = powerState !== null;
}

function modeLabel(key: number | null): string {
  if (key === null) {
    return 'Unavailable';
  }
  return radioModes.find((mode) => mode.key === key)?.label ?? String(key);
}

function updateModeSelection(): void {
  modeSelect.value = currentModeKey === null ? '' : String(currentModeKey);
}

function resetModeListForHost(host: string): void {
  if (modesHost === host) {
    return;
  }
  modesHost = host;
  modeListRequestedFor = null;
  radioModes = [];
  selectableModes = [];
  modeSelect.replaceChildren();
  modeSelect.hidden = true;
  modeFallback.hidden = false;
}

function loadModes(target: RadioTarget): void {
  if (modesHost !== target.host || modeListRequestedFor === target.host) {
    return;
  }
  modeListRequestedFor = target.host;

  void getModes(target).then((result) => {
    if (hostInput.value.trim() !== target.host || modesHost !== target.host) {
      return;
    }
    if (!result.ok) {
      modeSelect.hidden = true;
      modeFallback.hidden = false;
      return;
    }

    radioModes = result.value;
    selectableModes = radioModes.filter((mode) => mode.selectable);
    if (selectableModes.length === 0) {
      modeSelect.hidden = true;
      modeFallback.hidden = false;
      return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a mode';
    modeSelect.replaceChildren(placeholder);
    for (const mode of radioModes) {
      const option = document.createElement('option');
      option.value = String(mode.key);
      option.textContent = mode.label;
      option.disabled = !mode.selectable;
      modeSelect.append(option);
    }
    modeSelect.hidden = false;
    modeFallback.hidden = true;
    modeStatus.textContent = modeLabel(currentModeKey);
    updateModeSelection();
  });
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function renderStatus(result: RadioStatus): void {
  lastChecked.textContent = formatTime(new Date());

  if (result.kind === 'online') {
    status.textContent = 'Radio online';
    powerState = result.power;
    currentModeKey = result.modeKey;
    currentVolume = result.volume;
    powerStatus.textContent = result.power ? 'On' : 'Off';
    modeStatus.textContent = modeLabel(result.modeKey);
    radioVolumeStatus.textContent = result.volume === null ? 'Unavailable' : `${result.volume} / ${maxVolume}`;
    updatePowerControls();
    updateModeSelection();

    if (result.volume !== null && Date.now() - lastVolumeInputAt >= 2000) {
      const sliderLevel = clampVolume(result.volume, maxVolume);
      volumeSlider.value = String(sliderLevel);
      volumeValue.textContent = String(sliderLevel);
    }
    return;
  }

  powerState = null;
  currentModeKey = null;
  currentVolume = null;
  updatePowerControls();
  clearStatusDetails();
  if (result.kind === 'unreadable') {
    status.textContent = 'Radio online, but details are unavailable (CORS blocked).';
  } else if (result.kind === 'pin-rejected') {
    status.textContent = 'PIN rejected; check the radio PIN.';
  } else {
    status.textContent = `Radio offline (${result.reason}).`;
  }
}

const poller = createPoller(async () => {
  const target = getTarget();
  if (!isValidHost(target.host)) {
    return;
  }

  const requestVersion = statusVersion;
  status.textContent = 'Checking radio…';
  const result = await getRadioStatus(target);
  if (requestVersion !== statusVersion) {
    return;
  }
  renderStatus(result);
  if (result.kind === 'online') {
    loadModes(target);
  }
}, 10_000);

function applyVolumeMax(value: number): void {
  maxVolume = value;
  volumeSlider.max = String(maxVolume);
  if (currentVolume !== null) {
    radioVolumeStatus.textContent = `${currentVolume} / ${maxVolume}`;
  }
  const sliderLevel = clampVolume(Number(volumeSlider.value), maxVolume);
  volumeSlider.value = String(sliderLevel);
  volumeValue.textContent = String(sliderLevel);
}

function loadVolumeSteps(target: RadioTarget): void {
  if (attemptedVolumeStepsHosts.has(target.host)) {
    applyVolumeMax(volumeStepsByHost.get(target.host) ?? 20);
    return;
  }

  attemptedVolumeStepsHosts.add(target.host);
  applyVolumeMax(20);
  void fsapiGetNumber(target, 'netRemote.sys.caps.volumeSteps').then((result) => {
    if (!result.ok) {
      return;
    }

    const volumeMax = Math.max(0, Math.floor(result.value) - 1);
    volumeStepsByHost.set(target.host, volumeMax);
    if (hostInput.value.trim() === target.host) {
      applyVolumeMax(volumeMax);
    }
  });
}

function updateControls(): void {
  const validHost = isValidHost(hostInput.value);
  volumeSlider.disabled = !validHost;
  pollToggle.disabled = !validHost;
  statusVersion += 1;
  poller.stop();
  lastChecked.textContent = '—';
  powerState = null;
  currentModeKey = null;
  currentVolume = null;
  clearStatusDetails();
  updatePowerControls();
  modeNumber.disabled = !validHost;
  modeSetButton.disabled = !validHost;
  modeSelect.disabled = !validHost;

  if (validHost) {
    status.textContent = 'Checking radio…';
    loadVolumeSteps(getTarget());
    poller.start();
    pollToggle.textContent = 'Pause polling';
  } else if (hostInput.value.trim() === '') {
    status.textContent = 'Enter a radio IPv4 address (optionally followed by :port).';
    pollToggle.textContent = 'Pause polling';
  } else {
    status.textContent = 'Enter a valid IPv4 address (optionally followed by :port).';
    pollToggle.textContent = 'Pause polling';
  }
}

hostInput.addEventListener('input', () => {
  saveStoredValue(storage, hostStorageKey, hostInput.value);
  resetModeListForHost(hostInput.value.trim());
  updateControls();
});

pinInput.addEventListener('input', () => {
  saveStoredValue(storage, pinStorageKey, pinInput.value);
  updateControls();
});

pollToggle.addEventListener('click', () => {
  if (poller.running) {
    poller.stop();
    pollToggle.textContent = 'Resume polling';
    status.textContent = 'Polling paused';
  } else {
    poller.start();
    pollToggle.textContent = 'Pause polling';
    status.textContent = 'Checking radio…';
  }
});

async function changePower(on: boolean): Promise<void> {
  const target = getTarget();
  if (!isValidHost(target.host)) {
    return;
  }

  const requestVersion = statusVersion;
  status.textContent = `Sending power ${on ? 'on' : 'off'}…`;
  const sent = await setPower(target, on);
  if (requestVersion !== statusVersion) {
    return;
  }
  status.textContent = sent ? 'Power change sent' : 'Power change failed';
  poller.triggerNow();
}

powerToggle.addEventListener('click', () => {
  if (powerState !== null) {
    void changePower(!powerState);
  }
});

powerOnButton.addEventListener('click', () => {
  void changePower(true);
});

powerOffButton.addEventListener('click', () => {
  void changePower(false);
});

async function changeMode(key: number): Promise<void> {
  const target = getTarget();
  if (!isValidHost(target.host) || !Number.isSafeInteger(key) || key < 0) {
    return;
  }

  const requestVersion = statusVersion;
  status.textContent = 'Sending mode change…';
  const sent = await setMode(target, key);
  if (requestVersion !== statusVersion) {
    return;
  }
  status.textContent = sent ? 'Mode change sent' : 'Mode change failed';
  poller.triggerNow();
}

modeSelect.addEventListener('change', () => {
  const key = Number(modeSelect.value);
  if (modeSelect.value !== '' && Number.isSafeInteger(key)) {
    void changeMode(key);
  }
});

modeSetButton.addEventListener('click', () => {
  const key = Number(modeNumber.value);
  if (modeNumber.value !== '' && Number.isSafeInteger(key) && key >= 0) {
    void changeMode(key);
  }
});

const sendVolume = throttleTrailing((
  host: string,
  pin: string,
  level: number,
  volumeMax: number,
  requestVersion: number
): void => {
  void setVolume({ host, pin }, level, undefined, volumeMax).then((sent) => {
    if (requestVersion !== statusVersion) {
      return;
    }
    status.textContent = sent
      ? `Volume set to ${level} (sent)`
      : `Volume set to ${level} (send failed)`;
    poller.triggerNow();
  });
}, 250);

volumeSlider.addEventListener('input', () => {
  lastVolumeInputAt = Date.now();
  const level = clampVolume(Number(volumeSlider.value), maxVolume);
  volumeValue.textContent = String(level);
  const target = getTarget();
  if (!isValidHost(target.host)) {
    updateControls();
    return;
  }

  const requestVersion = statusVersion;
  sendVolume(target.host, target.pin, level, maxVolume, requestVersion);
});

volumeValue.textContent = volumeSlider.value;
updatePowerControls();
updateControls();

if (canRegisterServiceWorker(location.protocol, 'serviceWorker' in navigator)) {
  void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}