export class MissionLock {
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  tryAcquire(): boolean {
    if (this.running) {
      return false;
    }

    this.running = true;
    return true;
  }

  release(): void {
    this.running = false;
  }
}
