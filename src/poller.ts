export interface Poller {
  start(): void;
  stop(): void;
  triggerNow(): void;
  readonly running: boolean;
}

export function createPoller(task: () => Promise<void>, intervalMs: number): Poller {
  const interval = Number.isFinite(intervalMs) ? Math.max(1, intervalMs) : 1;
  let isRunning = false;
  let inFlight = false;
  let pendingTrigger = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const taskFinished = (): void => {
    inFlight = false;
    if (pendingTrigger) {
      pendingTrigger = false;
      runTask(true);
    }
  };

  const runTask = (allowStopped = false): void => {
    if ((!isRunning && !allowStopped) || inFlight) {
      return;
    }

    inFlight = true;
    let taskPromise: Promise<void>;
    try {
      taskPromise = task();
    } catch {
      inFlight = false;
      return;
    }
    void taskPromise.then(taskFinished, taskFinished);
  };

  return {
    start(): void {
      if (isRunning) {
        return;
      }
      isRunning = true;
      if (inFlight) {
        pendingTrigger = true;
      }
      runTask();
      timer = setInterval(runTask, interval);
    },
    stop(): void {
      isRunning = false;
      pendingTrigger = false;
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    },
    triggerNow(): void {
      if (inFlight) {
        pendingTrigger = true;
        return;
      }
      runTask(true);
    },
    get running(): boolean {
      return isRunning;
    }
  };
}