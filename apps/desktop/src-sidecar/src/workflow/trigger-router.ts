const MAX_TIMEOUT_MS = 2147483647;

export interface TriggerRouterDelegate {
  getNextScheduleAt: () => Promise<number | null>;
  runDueSchedules: () => Promise<void>;
}

export class WorkflowTriggerRouter {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private delegate: TriggerRouterDelegate;

  constructor(delegate: TriggerRouterDelegate) {
    this.delegate = delegate;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.arm();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async refresh(): Promise<void> {
    if (!this.running) return;
    await this.arm();
  }

  private async arm(): Promise<void> {
    if (!this.running) return;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const nextAt = await this.delegate.getNextScheduleAt();
    if (!nextAt) return;

    const delay = Math.min(Math.max(0, nextAt - Date.now()), MAX_TIMEOUT_MS);

    this.timer = setTimeout(() => {
      void this.onTick();
    }, delay);

    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  private async onTick(): Promise<void> {
    if (!this.running) return;

    try {
      await this.delegate.runDueSchedules();
    } finally {
      await this.arm();
    }
  }
}
