import {
  enableNavigation,
  deletePreset,
  fsapiGetNumber,
  getNavCaps,
  getModes,
  getPresets,
  playPreset,
  savePreset,
  setMode,
  setPower,
  setVolume,
  type RadioTarget
} from './fsapi.js';
import type { RadioMode, RadioPreset } from './fsapiXml.js';
import { getRadioStatus, type RadioStatus } from './radioStatus.js';
import { createPoller } from './poller.js';
import {
  presetCapabilities,
  shouldReloadPresets,
  shortenUrl,
  validatePresetInput,
  type PresetContext
} from './presets.js';
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
const presetRefresh = requireElement<HTMLButtonElement>('#preset-refresh');
const presetStatus = requireElement<HTMLParagraphElement>('#preset-status');
const presetRows = requireElement<HTMLTableSectionElement>('#preset-rows');
const presetDialog = requireElement<HTMLDialogElement>('#preset-dialog');
const presetDialogPosition = requireElement<HTMLSpanElement>('#preset-dialog-position');
const presetDialogError = requireElement<HTMLParagraphElement>('#preset-dialog-error');
const presetForm = requireElement<HTMLFormElement>('#preset-form');
const presetNameInput = requireElement<HTMLInputElement>('#preset-name');
const presetUrlInput = requireElement<HTMLInputElement>('#preset-url');
const presetSaveButton = requireElement<HTMLButtonElement>('#preset-save');
const presetCancelButton = requireElement<HTMLButtonElement>('#preset-cancel');

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
let presetContext: PresetContext | null = null;
let presetBusy = false;
let presetReloadPending = false;
let presetVersion = 0;
let presetItems: RadioPreset[] = [];
let presetEditable = false;
let presetReloadAfterNextStatus = false;
let presetReloadSuccessMessage = '';
let editingPreset: RadioPreset | null = null;

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

function presetTargetKey(target: RadioTarget): string {
  return `${target.host}\u0000${target.pin}`;
}

function renderPresetRows(): void {
  const rows = presetItems.map((preset) => {
    const row = document.createElement('tr');
    const positionCell = document.createElement('td');
    positionCell.textContent = String(preset.position);
    const nameCell = document.createElement('td');
    nameCell.textContent = preset.empty ? '(empty)' : preset.name;
    const urlCell = document.createElement('td');
    urlCell.className = 'preset-url';
    urlCell.title = preset.url;
    urlCell.textContent = preset.empty ? '(empty)' : shortenUrl(preset.url);
    const actionsCell = document.createElement('td');
    actionsCell.className = 'preset-actions';
    if (!preset.empty) {
      const playButton = document.createElement('button');
      playButton.type = 'button';
      playButton.textContent = 'Play';
      playButton.addEventListener('click', () => { void playPresetRow(preset); });
      actionsCell.append(playButton);
    }
    if (presetEditable) {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = 'Edit';
      editButton.addEventListener('click', () => openPresetEditor(preset));
      actionsCell.append(editButton);
      if (!preset.empty) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => { void deletePresetRow(preset); });
        actionsCell.append(deleteButton);
      }
    }
    row.append(positionCell, nameCell, urlCell, actionsCell);
    return row;
  });
  presetRows.replaceChildren(...rows);
}

function updatePresetControls(): void {
  const disabled = !isValidHost(hostInput.value) || presetBusy;
  presetRefresh.disabled = disabled;
  presetNameInput.disabled = disabled;
  presetUrlInput.disabled = disabled;
  presetSaveButton.disabled = disabled;
  presetCancelButton.disabled = disabled;
  for (const button of presetRows.querySelectorAll('button')) {
    button.disabled = disabled;
  }
}

function closePresetDialog(): void {
  if (presetDialog.open) {
    presetDialog.close();
  }
  editingPreset = null;
}

function resetPresetSection(message: string): void {
  presetVersion += 1;
  presetContext = null;
  presetItems = [];
  presetEditable = false;
  presetReloadAfterNextStatus = false;
  presetReloadPending = false;
  presetReloadSuccessMessage = '';
  closePresetDialog();
  presetRows.replaceChildren();
  presetStatus.textContent = message;
  updatePresetControls();
}

function presetFailureMessage(reason: string, detail: string | undefined): string {
  if (reason === 'pin') {
    return 'Presets unavailable: PIN rejected.';
  }
  if (reason === 'fsapi') {
    return `Presets unavailable: radio error${detail === undefined ? '' : ` (${detail})`}.`;
  }
  return `Presets unavailable: ${reason}.`;
}

function isCurrentPresetTarget(target: RadioTarget): boolean {
  const currentTarget = getTarget();
  return isValidHost(currentTarget.host)
    && currentTarget.host === target.host
    && currentTarget.pin === target.pin;
}

function runPendingPresetReload(): void {
  if (!presetReloadPending) {
    return;
  }
  presetReloadPending = false;
  if (presetContext?.power === true && isValidHost(hostInput.value)) {
    void loadPresets();
  }
}

async function loadPresets(): Promise<void> {
  if (!isValidHost(hostInput.value)) {
    return;
  }
  if (presetBusy) {
    presetReloadPending = true;
    return;
  }

  const target = getTarget();
  const requestVersion = presetVersion;
  presetBusy = true;
  presetItems = [];
  presetEditable = false;
  renderPresetRows();
  presetStatus.textContent = 'Loading presets…';
  updatePresetControls();

  try {
    const navigationResult = await enableNavigation(target);
    if (requestVersion !== presetVersion || !isCurrentPresetTarget(target)) {
      return;
    }
    if (!navigationResult.ok) {
      presetReloadSuccessMessage = '';
      presetStatus.textContent = presetFailureMessage(navigationResult.reason, navigationResult.detail);
      return;
    }

    const capsResult = await getNavCaps(target);
    if (requestVersion !== presetVersion || !isCurrentPresetTarget(target)) {
      return;
    }
    if (!capsResult.ok) {
      presetReloadSuccessMessage = '';
      presetStatus.textContent = presetFailureMessage(capsResult.reason, capsResult.detail);
      return;
    }

    const capabilities = presetCapabilities(capsResult.value);
    presetEditable = capabilities.editable;
    if (!capabilities.supported) {
      presetReloadSuccessMessage = '';
      presetStatus.textContent = "The current mode doesn't support presets.";
      return;
    }

    const presetsResult = await getPresets(target);
    if (requestVersion !== presetVersion || !isCurrentPresetTarget(target)) {
      return;
    }
    if (!presetsResult.ok) {
      presetReloadSuccessMessage = '';
      presetStatus.textContent = presetFailureMessage(presetsResult.reason, presetsResult.detail);
      return;
    }

    presetItems = presetsResult.value;
    renderPresetRows();
    const loadedCount = `${presetItems.length} preset${presetItems.length === 1 ? '' : 's'} loaded.`;
    presetStatus.textContent = presetReloadSuccessMessage === ''
      ? loadedCount
      : `${presetReloadSuccessMessage} ${loadedCount}`;
    presetReloadSuccessMessage = '';
  } catch (error) {
    if (requestVersion === presetVersion && isCurrentPresetTarget(target)) {
      const detail = error instanceof Error ? ` (${error.message})` : '';
      presetReloadSuccessMessage = '';
      presetStatus.textContent = `Presets unavailable: network error${detail}.`;
    }
  } finally {
    presetBusy = false;
    updatePresetControls();
    runPendingPresetReload();
  }
}

function updatePresetsForStatus(result: RadioStatus): void {
  const target = getTarget();
  const nextContext: PresetContext = {
    target: presetTargetKey(target),
    power: result.kind === 'online' ? result.power : null,
    modeKey: result.kind === 'online' ? result.modeKey : null
  };
  const previousContext = presetContext;
  const reloadAfterPlay = presetReloadAfterNextStatus && nextContext.power === true;
  if (presetReloadAfterNextStatus && nextContext.power !== true) {
    presetReloadAfterNextStatus = false;
  }
  const shouldReload = shouldReloadPresets(previousContext, nextContext) || reloadAfterPlay;
  presetContext = nextContext;

  if (nextContext.power === true) {
    if (shouldReload) {
      presetReloadAfterNextStatus = false;
      presetVersion += 1;
      presetItems = [];
      presetEditable = false;
      closePresetDialog();
      renderPresetRows();
      void loadPresets();
    }
    return;
  }

  if (previousContext?.power === true || (previousContext !== null && previousContext.target !== nextContext.target)) {
    presetVersion += 1;
    presetItems = [];
    presetEditable = false;
    closePresetDialog();
    renderPresetRows();
  }

  if (result.kind === 'online') {
    presetStatus.textContent = 'Turn the radio on to see presets.';
  } else if (result.kind === 'pin-rejected') {
    presetStatus.textContent = 'Presets unavailable: PIN rejected.';
  } else if (result.kind === 'offline') {
    presetStatus.textContent = `Presets unavailable: radio offline (${result.reason}).`;
  } else {
    presetStatus.textContent = 'Presets unavailable: radio details are unreadable (CORS or network).';
  }
}

function beginPresetAction(): { readonly target: RadioTarget; readonly version: number } | null {
  if (!isValidHost(hostInput.value) || presetBusy || presetContext?.power !== true) {
    return null;
  }
  presetBusy = true;
  updatePresetControls();
  return { target: getTarget(), version: presetVersion };
}

function finishPresetAction(reload = false, waitForStatus = false): void {
  if (reload) {
    presetVersion += 1;
    presetReloadPending = true;
  }
  if (waitForStatus) {
    presetReloadPending = false;
  }
  presetBusy = false;
  updatePresetControls();
  runPendingPresetReload();
}

function openPresetEditor(preset: RadioPreset): void {
  if (!presetEditable || presetBusy || presetContext?.power !== true || !isValidHost(hostInput.value)) {
    return;
  }
  editingPreset = preset;
  presetDialogPosition.textContent = String(preset.position);
  presetNameInput.value = preset.name;
  presetUrlInput.value = preset.url;
  presetDialogError.textContent = '';
  presetDialog.showModal();
}

async function playPresetRow(preset: RadioPreset): Promise<void> {
  if (preset.empty) {
    return;
  }
  const request = beginPresetAction();
  if (request === null) {
    return;
  }

  let waitForStatus = false;
  try {
    presetStatus.textContent = `Playing preset ${preset.position}…`;
    const result = await playPreset(request.target, preset.key);
    if (request.version !== presetVersion || !isCurrentPresetTarget(request.target)) {
      return;
    }
    if (!result.ok) {
      presetStatus.textContent = presetFailureMessage(result.reason, result.detail);
      return;
    }
    presetStatus.textContent = `Playing preset ${preset.position}`;
    presetReloadAfterNextStatus = true;
    waitForStatus = true;
  } catch (error) {
    if (request.version === presetVersion && isCurrentPresetTarget(request.target)) {
      const detail = error instanceof Error ? ` (${error.message})` : '';
      presetStatus.textContent = `Unable to play preset ${preset.position}: network error${detail}.`;
    }
  } finally {
    finishPresetAction(false, waitForStatus);
    if (waitForStatus) {
      poller.triggerNow();
    }
  }
}

async function savePresetFromDialog(): Promise<void> {
  const preset = editingPreset;
  if (preset === null) {
    return;
  }

  const input = validatePresetInput(presetNameInput.value, presetUrlInput.value);
  if (!input.ok) {
    presetDialogError.textContent = input.error;
    return;
  }
  if (input.name === preset.name && input.url === preset.url) {
    presetStatus.textContent = `Preset ${preset.position} unchanged.`;
    presetDialog.close();
    return;
  }

  const request = beginPresetAction();
  if (request === null) {
    return;
  }

  let reload = false;
  try {
    const result = await savePreset(request.target, preset.key, {
      name: input.name,
      url: input.url,
      type: preset.type || 'AirableRadio'
    });
    if (request.version !== presetVersion || !isCurrentPresetTarget(request.target)) {
      return;
    }
    if (!result.ok) {
      presetDialogError.textContent = presetFailureMessage(result.reason, result.detail);
      return;
    }
    presetReloadSuccessMessage = `Preset ${preset.position} saved.`;
    presetStatus.textContent = presetReloadSuccessMessage;
    presetDialog.close();
    reload = true;
  } catch (error) {
    if (request.version === presetVersion && isCurrentPresetTarget(request.target)) {
      const detail = error instanceof Error ? ` (${error.message})` : '';
      presetDialogError.textContent = `Unable to save preset: network error${detail}.`;
    }
  } finally {
    finishPresetAction(reload);
  }
}

async function deletePresetRow(preset: RadioPreset): Promise<void> {
  if (preset.empty || !presetEditable || !window.confirm(`Delete preset ${preset.position} "${preset.name}"?`)) {
    return;
  }
  const request = beginPresetAction();
  if (request === null) {
    return;
  }

  let reload = false;
  try {
    const result = await deletePreset(request.target, preset.key);
    if (request.version !== presetVersion || !isCurrentPresetTarget(request.target)) {
      return;
    }
    if (!result.ok) {
      presetStatus.textContent = presetFailureMessage(result.reason, result.detail);
      return;
    }
    presetReloadSuccessMessage = `Preset ${preset.position} deleted.`;
    presetStatus.textContent = presetReloadSuccessMessage;
    reload = true;
  } catch (error) {
    if (request.version === presetVersion && isCurrentPresetTarget(request.target)) {
      const detail = error instanceof Error ? ` (${error.message})` : '';
      presetStatus.textContent = `Unable to delete preset: network error${detail}.`;
    }
  } finally {
    finishPresetAction(reload);
  }
}

presetForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void savePresetFromDialog();
});

presetCancelButton.addEventListener('click', () => {
  if (!presetBusy) {
    presetDialog.close();
  }
});

presetDialog.addEventListener('cancel', (event) => {
  if (presetBusy) {
    event.preventDefault();
  }
});

presetDialog.addEventListener('close', () => {
  editingPreset = null;
  presetDialogError.textContent = '';
});

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
  updatePresetsForStatus(result);

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
  updatePresetControls();
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
  resetPresetSection(isValidHost(hostInput.value)
    ? 'Checking radio before loading presets…'
    : 'Enter a valid IPv4 address to load presets.');
  updateControls();
});

pinInput.addEventListener('input', () => {
  saveStoredValue(storage, pinStorageKey, pinInput.value);
  resetPresetSection(isValidHost(hostInput.value)
    ? 'Checking radio before loading presets…'
    : 'Enter a valid IPv4 address to load presets.');
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

presetRefresh.addEventListener('click', () => {
  if (!isValidHost(hostInput.value)) {
    return;
  }
  if (presetContext?.power === true) {
    presetVersion += 1;
    void loadPresets();
  } else {
    presetStatus.textContent = presetContext?.power === false
      ? 'Turn the radio on to see presets.'
      : 'Checking radio before loading presets…';
    poller.triggerNow();
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