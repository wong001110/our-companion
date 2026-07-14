interface ActionProgressProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
}

/** Accessible, value-backed feedback for a long-running user action. */
export function ActionProgress({
  label,
  value,
  min = 0,
  max = 100,
}: ActionProgressProps) {
  const clampedValue = Math.min(max, Math.max(min, value));
  const percent = max > min ? ((clampedValue - min) / (max - min)) * 100 : 0;

  return (
    <div
      className="action-progress"
      role="progressbar"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={clampedValue}
      aria-label={label}
    >
      <strong>{label}</strong>
      <span className="action-progress-track" aria-hidden="true">
        <span className="action-progress-value" style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}
