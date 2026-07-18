export interface ScenePosition {
  x: number;
  y: number;
}

export interface SceneBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface SceneSpriteSize {
  width: number;
  height: number;
}

export interface SceneFootprint {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

export interface CompanionMotionProfile {
  walkSpeedPxPerSecond: number;
  accelerationPxPerSecondSquared: number;
  decelerationPxPerSecondSquared: number;
  minimumWalkDistance: number;
  maximumWalkDistance: number;
}

export type SceneActorPhase = 'dragging' | 'transition' | 'stationary' | 'wandering';

export interface SceneActor {
  id: string;
  type: 'local_companion' | 'remote_visitor';
  position: ScenePosition;
  spriteSize?: SceneSpriteSize;
  phase: SceneActorPhase;
  motionProfile?: CompanionMotionProfile;
}

export type MoveResolution =
  | { status: 'moved'; position: ScenePosition }
  | { status: 'slid'; position: ScenePosition }
  | { status: 'blocked'; position: ScenePosition };

export interface MotionStep {
  desiredPosition: ScenePosition;
  speed: number;
  reachedTarget: boolean;
}

export const SCENE_SPRITE_SIZE: SceneSpriteSize = { width: 220, height: 230 };
export const BASE_WALK_SPEED = 80;
export const BASE_FRAME_DURATION_MS = 120;
export const DEFAULT_MOTION_PROFILE: CompanionMotionProfile = {
  walkSpeedPxPerSecond: BASE_WALK_SPEED,
  accelerationPxPerSecondSquared: 240,
  decelerationPxPerSecondSquared: 280,
  minimumWalkDistance: 24,
  maximumWalkDistance: 320,
};

const FOOTPRINT_RADIUS_X = 40;
const FOOTPRINT_RADIUS_Y = 18;
const FOOTPRINT_BOTTOM_INSET = 10;
const TELEPORT_TOLERANCE_PX = 2;

export function motionProfileForPersonality(energy = 50): CompanionMotionProfile {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(energy) ? energy : 50));
  const speedMultiplier = 0.9 + normalized / 500;
  return {
    ...DEFAULT_MOTION_PROFILE,
    walkSpeedPxPerSecond: BASE_WALK_SPEED * speedMultiplier,
  };
}

export function footprintForPosition(
  position: ScenePosition,
  spriteSize: SceneSpriteSize = SCENE_SPRITE_SIZE,
): SceneFootprint {
  return {
    centerX: position.x + spriteSize.width / 2,
    centerY: position.y + spriteSize.height - FOOTPRINT_BOTTOM_INSET - FOOTPRINT_RADIUS_Y,
    radiusX: FOOTPRINT_RADIUS_X,
    radiusY: FOOTPRINT_RADIUS_Y,
  };
}

export function footprintsOverlap(left: SceneFootprint, right: SceneFootprint): boolean {
  return normalizedFootprintDistance(left, right) < 1;
}

export function clampScenePosition(
  position: ScenePosition,
  bounds: SceneBounds,
  spriteSize: SceneSpriteSize = SCENE_SPRITE_SIZE,
): ScenePosition {
  const originX = bounds.x ?? 0;
  const originY = bounds.y ?? 0;
  const maxX = Math.max(originX, originX + bounds.width - spriteSize.width);
  const maxY = Math.max(originY, originY + bounds.height - spriteSize.height);
  return {
    x: Math.max(originX, Math.min(position.x, maxX)),
    y: Math.max(originY, Math.min(position.y, maxY)),
  };
}

export function stepTowardTarget(input: {
  current: ScenePosition;
  target: ScenePosition;
  currentSpeed: number;
  deltaTimeMs: number;
  profile?: CompanionMotionProfile;
}): MotionStep {
  const profile = input.profile ?? DEFAULT_MOTION_PROFILE;
  const rawDeltaSeconds = Math.max(0, input.deltaTimeMs) / 1000;
  const deltaSeconds = Math.min(rawDeltaSeconds, 0.1);
  const dx = input.target.x - input.current.x;
  const dy = input.target.y - input.current.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.01 || deltaSeconds === 0) {
    return { desiredPosition: distance <= 0.01 ? input.target : input.current, speed: distance <= 0.01 ? 0 : input.currentSpeed, reachedTarget: distance <= 0.01 };
  }

  const boundedCurrentSpeed = Math.max(0, Math.min(input.currentSpeed, profile.walkSpeedPxPerSecond));
  const stoppingDistance = boundedCurrentSpeed * boundedCurrentSpeed / (2 * profile.decelerationPxPerSecondSquared);
  const shouldDecelerate = distance <= stoppingDistance + 1;
  const targetSpeed = shouldDecelerate
    ? Math.min(profile.walkSpeedPxPerSecond, Math.sqrt(2 * profile.decelerationPxPerSecondSquared * distance))
    : profile.walkSpeedPxPerSecond;
  const rate = targetSpeed < boundedCurrentSpeed
    ? profile.decelerationPxPerSecondSquared
    : profile.accelerationPxPerSecondSquared;
  const speed = moveToward(boundedCurrentSpeed, targetSpeed, rate * deltaSeconds);
  const travel = Math.min(distance, speed * deltaSeconds);
  const reachedTarget = travel >= distance - 0.01;
  return {
    desiredPosition: reachedTarget
      ? input.target
      : { x: input.current.x + dx / distance * travel, y: input.current.y + dy / distance * travel },
    speed: reachedTarget ? 0 : speed,
    reachedTarget,
  };
}

export function computeWalkPlaybackRate(actualSpeed: number): number {
  return Math.max(0.8, Math.min(1.2, actualSpeed / BASE_WALK_SPEED));
}

export function movementPriority(phase: SceneActorPhase): number {
  switch (phase) {
    case 'dragging': return 4;
    case 'transition': return 3;
    case 'stationary': return 2;
    case 'wandering': return 1;
  }
}

export function actorHasPriority(left: Pick<SceneActor, 'id' | 'phase'>, right: Pick<SceneActor, 'id' | 'phase'>): boolean {
  const priorityDifference = movementPriority(left.phase) - movementPriority(right.phase);
  if (priorityDifference !== 0) return priorityDifference > 0;
  return left.id.localeCompare(right.id) < 0;
}

export function resolveFootprintMovement(
  actor: SceneActor,
  current: ScenePosition,
  desired: ScenePosition,
  occupants: SceneActor[],
  bounds: SceneBounds,
): MoveResolution {
  const spriteSize = actor.spriteSize ?? SCENE_SPRITE_SIZE;
  const bounded = clampScenePosition(desired, bounds, spriteSize);
  if (positionIsClear(actor, bounded, occupants) || movesOutOfExistingOverlap(actor, current, bounded, occupants)) {
    return { status: 'moved', position: bounded };
  }

  const slideX = { x: bounded.x, y: current.y };
  if (!samePosition(slideX, current) && positionIsClear(actor, slideX, occupants)) return { status: 'slid', position: slideX };
  const slideY = { x: current.x, y: bounded.y };
  if (!samePosition(slideY, current) && positionIsClear(actor, slideY, occupants)) return { status: 'slid', position: slideY };
  return { status: 'blocked', position: current };
}

export function isTeleportWithinInvariant(input: {
  previous: ScenePosition;
  next: ScenePosition;
  maxAllowedSpeed: number;
  deltaTimeMs: number;
  tolerance?: number;
  exclusion?: 'first_spawn' | 'user_drag' | 'display_recovery';
}): boolean {
  if (input.exclusion) return true;
  const allowed = input.maxAllowedSpeed * Math.max(0, input.deltaTimeMs) / 1000
    + (input.tolerance ?? TELEPORT_TOLERANCE_PX);
  return Math.hypot(input.next.x - input.previous.x, input.next.y - input.previous.y) <= allowed;
}

export function sceneDepthForPosition(position: ScenePosition, identity: string, spriteSize = SCENE_SPRITE_SIZE): number {
  return Math.round(footprintForPosition(position, spriteSize).centerY) * 1_000 + stableIdentityOffset(identity);
}

function positionIsClear(actor: SceneActor, position: ScenePosition, occupants: SceneActor[]): boolean {
  const footprint = footprintForPosition(position, actor.spriteSize);
  return occupants.every((occupant) => !footprintsOverlap(
    footprint,
    footprintForPosition(occupant.position, occupant.spriteSize),
  ));
}

function movesOutOfExistingOverlap(actor: SceneActor, current: ScenePosition, desired: ScenePosition, occupants: SceneActor[]): boolean {
  const currentFootprint = footprintForPosition(current, actor.spriteSize);
  const desiredFootprint = footprintForPosition(desired, actor.spriteSize);
  return occupants.every((occupant) => {
    const occupantFootprint = footprintForPosition(occupant.position, occupant.spriteSize);
    const currentDistance = normalizedFootprintDistance(currentFootprint, occupantFootprint);
    if (currentDistance >= 1) return normalizedFootprintDistance(desiredFootprint, occupantFootprint) >= 1;
    return normalizedFootprintDistance(desiredFootprint, occupantFootprint) > currentDistance;
  });
}

function normalizedFootprintDistance(left: SceneFootprint, right: SceneFootprint): number {
  const dx = (left.centerX - right.centerX) / (left.radiusX + right.radiusX);
  const dy = (left.centerY - right.centerY) / (left.radiusY + right.radiusY);
  return Math.sqrt(dx * dx + dy * dy);
}

function moveToward(value: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - value) <= maximumDelta) return target;
  return value + Math.sign(target - value) * maximumDelta;
}

function samePosition(left: ScenePosition, right: ScenePosition): boolean {
  return Math.abs(left.x - right.x) < 0.001 && Math.abs(left.y - right.y) < 0.001;
}

function stableIdentityOffset(identity: string): number {
  let value = 2166136261;
  for (const char of identity) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return (value >>> 0) % 1_000;
}
