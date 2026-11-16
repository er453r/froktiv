export function isValidHost(input: string): boolean {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(input.trim());
  const address = match?.[1];
  const port = match?.[2];

  if (address === undefined) {
    return false;
  }

  const octets = address.split('.');
  if (octets.length !== 4 || octets.some((octet) => !/^(0|[1-9]\d{0,2})$/.test(octet) || Number(octet) > 255)) {
    return false;
  }

  if (port !== undefined) {
    const portNumber = Number(port);
    return portNumber > 0 && portNumber <= 65535;
  }

  return true;
}

export function clampVolume(n: number, max = 20): number {
  const upperBound = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 20;
  const volume = Number.isFinite(n) ? Math.round(n) : 0;
  return Math.min(upperBound, Math.max(0, volume));
}