/**
 * Tick-based timer system that runs inside the game loop.
 * Replaces setTimeout for game events (respawns, attack resets, etc.)
 * so timers are deterministic, pausable, and not lost on crash.
 */
export class TickTimerManager {
  private timers: Map<string, { remaining: number; callback: () => void }> = new Map();

  /**
   * Schedule a callback after `delaySeconds` of game time.
   * If a timer with the same id exists, it is replaced.
   */
  schedule(id: string, delaySeconds: number, callback: () => void): void {
    this.timers.set(id, { remaining: delaySeconds, callback });
  }

  cancel(id: string): void {
    this.timers.delete(id);
  }

  has(id: string): boolean {
    return this.timers.has(id);
  }

  /**
   * Advance all timers by `delta` seconds. Fire and remove expired ones.
   * Called once per tick from the game loop.
   */
  update(delta: number): void {
    for (const [id, timer] of this.timers) {
      timer.remaining -= delta;
      if (timer.remaining <= 0) {
        this.timers.delete(id);
        timer.callback();
      }
    }
  }
}
