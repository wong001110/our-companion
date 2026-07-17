export type UnitScore = number;
export type Score100 = number;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Canonical constructor for normalized domain scores. */
export function toUnitScore(value: number): UnitScore {
  return clamp01(value);
}

/** Canonical constructor for persisted or display scores whose scale is explicit. */
export function toScore100(value: number): Score100 {
  return clampScore(value);
}

export function unitToScore100(value: UnitScore): Score100 {
  return toScore100(toUnitScore(value) * 100);
}

export function score100ToUnit(value: Score100): UnitScore {
  return toUnitScore(toScore100(value) / 100);
}
