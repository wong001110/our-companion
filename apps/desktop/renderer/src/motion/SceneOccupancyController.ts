import {
  DEFAULT_MOTION_PROFILE,
  actorHasPriority,
  clampScenePosition,
  footprintForPosition,
  footprintsOverlap,
  isTeleportWithinInvariant,
  resolveFootprintMovement,
  stepTowardTarget,
  type CompanionMotionProfile,
  type MoveResolution,
  type SceneActor,
  type SceneActorPhase,
  type SceneBounds,
  type ScenePosition,
} from './sceneMotion';

interface RuntimeActor extends SceneActor {
  currentSpeed: number;
  blockedForMs: number;
  target?: ScenePosition;
  lastResolution: MoveResolution['status'];
  replanReason?: string;
}

export type SceneMotionStepResult = MoveResolution & {
  speed: number;
  reachedTarget: boolean;
  cancelPath: boolean;
};

export interface SceneMotionDiagnostics {
  actors: Array<RuntimeActor & { footprint: ReturnType<typeof footprintForPosition>; priority: number }>;
  largestFrameDelta: number;
  teleportViolationCount: number;
  continuityEvents: string[];
}

export class SceneOccupancyController {
  private readonly actors = new Map<string, RuntimeActor>();
  private largestFrameDelta = 0;
  private teleportViolationCount = 0;
  private readonly continuityEvents: string[] = [];

  constructor(private bounds: SceneBounds) {}

  setBounds(bounds: SceneBounds): void {
    this.bounds = bounds;
  }

  register(actor: SceneActor): void {
    const existing = this.actors.get(actor.id);
    this.actors.set(actor.id, {
      ...actor,
      currentSpeed: existing?.currentSpeed ?? 0,
      blockedForMs: existing?.blockedForMs ?? 0,
      target: existing?.target,
      lastResolution: existing?.lastResolution ?? 'moved',
      replanReason: existing?.replanReason,
    });
    this.recordContinuityEvent(existing ? `registered-existing:${actor.id}` : `first-spawn:${actor.id}`);
  }

  unregister(actorId: string, reason = 'unregistered'): void {
    if (this.actors.delete(actorId)) this.recordContinuityEvent(`${reason}:${actorId}`);
  }

  update(actorId: string, input: Partial<Omit<SceneActor, 'id'>>): void {
    const current = this.actors.get(actorId);
    if (!current) return;
    this.actors.set(actorId, { ...current, ...input, id: actorId });
  }

  updatePosition(actorId: string, position: ScenePosition, exclusion?: 'user_drag' | 'display_recovery'): void {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    if (!isTeleportWithinInvariant({
      previous: actor.position,
      next: position,
      maxAllowedSpeed: actor.motionProfile?.walkSpeedPxPerSecond ?? DEFAULT_MOTION_PROFILE.walkSpeedPxPerSecond,
      deltaTimeMs: 0,
      exclusion,
    })) this.teleportViolationCount += 1;
    actor.position = position;
    if (exclusion) this.recordContinuityEvent(`${exclusion}:${actorId}`);
  }

  getPosition(actorId: string): ScenePosition | undefined {
    const position = this.actors.get(actorId)?.position;
    return position ? { ...position } : undefined;
  }

  planTarget(actorId: string, preferred: ScenePosition): ScenePosition | undefined {
    const actor = this.actors.get(actorId);
    if (!actor) return undefined;
    const profile = actor.motionProfile ?? DEFAULT_MOTION_PROFILE;
    const dx = preferred.x - actor.position.x;
    const dy = preferred.y - actor.position.y;
    const rawDistance = Math.hypot(dx, dy);
    if (rawDistance < profile.minimumWalkDistance) return undefined;
    const distance = Math.min(rawDistance, profile.maximumWalkDistance);
    const baseAngle = Math.atan2(dy, dx);
    const candidates = Array.from({ length: 10 }, (_, index) => {
      const offsetIndex = index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 === 0 ? -1 : 1);
      const angle = baseAngle + offsetIndex * Math.PI / 10;
      return clampScenePosition({
        x: actor.position.x + Math.cos(angle) * distance,
        y: actor.position.y + Math.sin(angle) * distance,
      }, this.bounds, actor.spriteSize);
    });
    return candidates.find((candidate) => this.endpointAndPathAreClear(actor, candidate));
  }

  resolveMovement(actorId: string, current: ScenePosition, desired: ScenePosition, deltaTimeMs: number): MoveResolution {
    const actor = this.actors.get(actorId);
    if (!actor) return { status: 'blocked', position: current };
    const occupants = [...this.actors.values()]
      .filter((occupant) => occupant.id !== actorId)
      // In a same-frame conflict the stable priority winner is allowed to
      // advance; the loser observes the winner and blocks/slides on its turn.
      .filter((occupant) => actorHasPriority(occupant, actor))
      .sort((left, right) => {
        if (actorHasPriority(left, right)) return -1;
        if (actorHasPriority(right, left)) return 1;
        return left.id.localeCompare(right.id);
      });
    const result = resolveFootprintMovement(actor, current, desired, occupants, this.bounds);
    this.largestFrameDelta = Math.max(this.largestFrameDelta, Math.max(0, deltaTimeMs));
    return result;
  }

  step(actorId: string, target: ScenePosition, deltaTimeMs: number): SceneMotionStepResult {
    const actor = this.actors.get(actorId);
    if (!actor) return { status: 'blocked', position: target, speed: 0, reachedTarget: false, cancelPath: true };
    const profile = actor.motionProfile ?? DEFAULT_MOTION_PROFILE;
    actor.target = target;
    const motion = stepTowardTarget({
      current: actor.position,
      target,
      currentSpeed: actor.currentSpeed,
      deltaTimeMs,
      profile,
    });
    const resolution = this.resolveMovement(actorId, actor.position, motion.desiredPosition, deltaTimeMs);
    if (!isTeleportWithinInvariant({
      previous: actor.position,
      next: resolution.position,
      maxAllowedSpeed: profile.walkSpeedPxPerSecond,
      deltaTimeMs,
    })) {
      this.teleportViolationCount += 1;
      actor.currentSpeed = 0;
      actor.blockedForMs += deltaTimeMs;
      actor.lastResolution = 'blocked';
      actor.replanReason = 'teleport_invariant';
      return { status: 'blocked', position: actor.position, speed: 0, reachedTarget: false, cancelPath: actor.blockedForMs >= 500 };
    }
    actor.position = resolution.position;
    actor.lastResolution = resolution.status;
    if (resolution.status === 'blocked') {
      actor.currentSpeed = 0;
      actor.blockedForMs += deltaTimeMs;
      actor.replanReason = actor.blockedForMs >= 500 ? 'blocked_timeout' : 'occupant';
    } else {
      actor.currentSpeed = motion.speed;
      actor.blockedForMs = 0;
      actor.replanReason = undefined;
    }
    const reachedTarget = motion.reachedTarget || Math.hypot(target.x - actor.position.x, target.y - actor.position.y) <= 1;
    if (reachedTarget) {
      actor.currentSpeed = 0;
      actor.target = undefined;
    }
    return {
      ...resolution,
      speed: actor.currentSpeed,
      reachedTarget,
      cancelPath: actor.blockedForMs >= 500,
    };
  }

  setPhase(actorId: string, phase: SceneActorPhase): void {
    this.update(actorId, { phase });
  }

  getDiagnostics(): SceneMotionDiagnostics {
    return {
      actors: [...this.actors.values()].map((actor) => ({
        ...actor,
        position: { ...actor.position },
        footprint: footprintForPosition(actor.position, actor.spriteSize),
        priority: phasePriority(actor.phase),
      })),
      largestFrameDelta: this.largestFrameDelta,
      teleportViolationCount: this.teleportViolationCount,
      continuityEvents: [...this.continuityEvents],
    };
  }

  private endpointAndPathAreClear(actor: RuntimeActor, target: ScenePosition): boolean {
    const occupants = [...this.actors.values()].filter((occupant) => occupant.id !== actor.id);
    const initiallyOverlapping = new Set(occupants
      .filter((occupant) => footprintsOverlap(
        footprintForPosition(actor.position, actor.spriteSize),
        footprintForPosition(occupant.position, occupant.spriteSize),
      ))
      .map((occupant) => occupant.id));
    for (let index = 1; index <= 4; index += 1) {
      const progress = index / 4;
      const sample = {
        x: actor.position.x + (target.x - actor.position.x) * progress,
        y: actor.position.y + (target.y - actor.position.y) * progress,
      };
      const footprint = footprintForPosition(sample, actor.spriteSize);
      if (occupants.some((occupant) => !initiallyOverlapping.has(occupant.id)
        && footprintsOverlap(footprint, footprintForPosition(occupant.position, occupant.spriteSize)))) return false;
    }
    return occupants.every((occupant) => !footprintsOverlap(
      footprintForPosition(target, actor.spriteSize),
      footprintForPosition(occupant.position, occupant.spriteSize),
    ));
  }

  recordContinuityEvent(event: string): void {
    this.continuityEvents.push(event);
    if (this.continuityEvents.length > 30) this.continuityEvents.shift();
  }
}

function phasePriority(phase: SceneActorPhase): number {
  switch (phase) {
    case 'dragging': return 4;
    case 'transition': return 3;
    case 'stationary': return 2;
    case 'wandering': return 1;
  }
}
