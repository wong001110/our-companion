import { formatJson } from './utils';

export function DebugJsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="debug-ai-log-block">
      <span>{title}</span>
      <pre className="debug-ai-log-raw">{formatJson(value)}</pre>
    </div>
  );
}

export function DebugTextBlock({ title, value, tone }: { title: string; value: string; tone?: 'error' }) {
  return (
    <div className={`debug-ai-log-block ${tone === 'error' ? 'debug-ai-log-block-error' : ''}`}>
      <span>{title}</span>
      <pre className="debug-ai-log-raw">{value}</pre>
    </div>
  );
}
