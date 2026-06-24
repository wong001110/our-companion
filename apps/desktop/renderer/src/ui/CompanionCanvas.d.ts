import type { CharacterRuntimeState } from '@our-companion/shared';
import { type AnimationName } from '../character/ann/animationConfig';
export type { AnimationName };
export interface CompanionDragPoint {
    clientX: number;
    clientY: number;
    screenX: number;
    screenY: number;
}
interface CompanionCanvasProps {
    state?: CharacterRuntimeState;
    compact?: boolean;
    animationOverride?: AnimationName;
    facing?: 'left' | 'right';
    isListening?: boolean;
    onPointerHitChange?: (isHit: boolean) => void;
    onOpenPanel?: () => void;
    onToggleListen?: () => void;
    onDragStart?: (point: CompanionDragPoint) => void;
    onDragMove?: (point: CompanionDragPoint) => void;
    onDragEnd?: (point: CompanionDragPoint) => void;
}
export declare function CompanionCanvas({ state, compact, animationOverride, facing, isListening, onPointerHitChange, onOpenPanel, onToggleListen, onDragStart, onDragMove, onDragEnd }: CompanionCanvasProps): import("react").JSX.Element;
