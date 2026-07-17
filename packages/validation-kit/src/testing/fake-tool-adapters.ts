import type { ToolAdapters } from '../production-runtime';

export interface FakeToolCall {
  toolName: 'open_url' | 'open_app' | 'search_web' | 'browser_navigation';
  args: Record<string, unknown>;
}

type ToolOutcome = unknown | Error;

export class FakeToolAdapters implements ToolAdapters {
  readonly calls: FakeToolCall[] = [];
  private readonly outcomes = new Map<FakeToolCall['toolName'], ToolOutcome[]>();

  enqueueResult(toolName: FakeToolCall['toolName'], result: unknown): void {
    this.enqueue(toolName, result);
  }

  enqueueError(toolName: FakeToolCall['toolName'], error: Error | string): void {
    this.enqueue(toolName, error instanceof Error ? error : new Error(error));
  }

  openUrl(url: string): Promise<unknown> {
    return this.invoke('open_url', { url });
  }

  openApp(appName: string): Promise<unknown> {
    return this.invoke('open_app', { appName });
  }

  searchWeb(query: string, target?: string): Promise<unknown> {
    return this.invoke('search_web', { query, target });
  }

  browserNavigation(action: string, url?: string): Promise<unknown> {
    return this.invoke('browser_navigation', { action, url });
  }

  private enqueue(toolName: FakeToolCall['toolName'], outcome: ToolOutcome): void {
    const queue = this.outcomes.get(toolName) ?? [];
    queue.push(outcome);
    this.outcomes.set(toolName, queue);
  }

  private async invoke(toolName: FakeToolCall['toolName'], args: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ toolName, args: structuredClone(args) });
    const outcome = this.outcomes.get(toolName)?.shift();
    if (outcome instanceof Error) throw outcome;
    return structuredClone(outcome ?? { ok: true });
  }
}
