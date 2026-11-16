export function throttleTrailing<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  const interval = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  let lastRun = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: A | undefined;

  const invoke = (): void => {
    const args = pendingArgs;
    if (args === undefined) {
      return;
    }
    pendingArgs = undefined;
    lastRun = Date.now();
    fn(...args);
  };

  return (...args: A): void => {
    pendingArgs = args;
    const remaining = interval - (Date.now() - lastRun);

    if (remaining <= 0) {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      invoke();
      return;
    }

    if (timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        invoke();
      }, remaining);
    }
  };
}