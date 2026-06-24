import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { annAnimations } from '../character/ann/animationConfig';
import { SpriteAnimator } from '../character/SpriteAnimator';
const canvasSize = {
    normal: { width: 220, height: 230 },
    compact: { width: 260, height: 260 }
};
export function CompanionCanvas({ state, compact = false, animationOverride, facing = 'right', isListening = false, onPointerHitChange, onOpenPanel, onToggleListen, onDragStart, onDragMove, onDragEnd }) {
    const canvasRef = useRef(null);
    const wrapperRef = useRef(null);
    const isPointerHitRef = useRef(false);
    const dragCandidateRef = useRef(undefined);
    const isDraggingRef = useRef(false);
    const suppressClickRef = useRef(false);
    const suppressClickTimeoutRef = useRef(undefined);
    const singleClickTimeoutRef = useRef(undefined);
    const [assetFailed, setAssetFailed] = useState(false);
    const intent = state?.intent ?? 'waiting';
    const animation = useMemo(() => {
        return animationOverride ? annAnimations[animationOverride] : selectAnimation(state);
    }, [animationOverride, state?.coreState, state?.intent]);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        setAssetFailed(false);
        const viewport = compact ? canvasSize.compact : canvasSize.normal;
        const animator = new SpriteAnimator(animation, {
            cacheKey: animation.name,
            onError: () => setAssetFailed(true)
        });
        let active = true;
        animator
            .load()
            .then(() => {
            if (!active)
                return;
            animator.start(canvas, viewport);
        })
            .catch(() => {
            if (active)
                setAssetFailed(true);
        });
        return () => {
            active = false;
            animator.destroy();
        };
    }, [animation, compact]);
    useEffect(() => {
        return () => {
            if (suppressClickTimeoutRef.current !== undefined) {
                window.clearTimeout(suppressClickTimeoutRef.current);
            }
            if (singleClickTimeoutRef.current !== undefined) {
                window.clearTimeout(singleClickTimeoutRef.current);
            }
        };
    }, []);
    function updatePointerHit(isHit) {
        if (isPointerHitRef.current === isHit)
            return;
        isPointerHitRef.current = isHit;
        onPointerHitChange?.(isHit);
    }
    function handlePointerDown(event) {
        if (event.button !== 0)
            return;
        const isHit = pointerHitTest(event);
        updatePointerHit(isHit);
        if (!isHit)
            return;
        dragCandidateRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
    }
    function handlePointerMove(event) {
        const dragCandidate = dragCandidateRef.current;
        if (dragCandidate?.pointerId === event.pointerId) {
            const distance = Math.hypot(event.clientX - dragCandidate.startX, event.clientY - dragCandidate.startY);
            if (!isDraggingRef.current && distance >= 5) {
                isDraggingRef.current = true;
                suppressClickRef.current = true;
                onDragStart?.(eventPoint(event));
            }
            if (isDraggingRef.current) {
                onDragMove?.(eventPoint(event));
                event.preventDefault();
                return;
            }
        }
        updatePointerHit(pointerHitTest(event));
    }
    function handlePointerUp(event) {
        const dragCandidate = dragCandidateRef.current;
        if (dragCandidate?.pointerId !== event.pointerId)
            return;
        if (isDraggingRef.current) {
            onDragEnd?.(eventPoint(event));
            isDraggingRef.current = false;
            if (suppressClickTimeoutRef.current !== undefined) {
                window.clearTimeout(suppressClickTimeoutRef.current);
            }
            suppressClickTimeoutRef.current = window.setTimeout(() => {
                suppressClickRef.current = false;
                suppressClickTimeoutRef.current = undefined;
            }, 250);
        }
        dragCandidateRef.current = undefined;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        updatePointerHit(pointerHitTest(event));
    }
    function handlePointerCancel(event) {
        if (isDraggingRef.current)
            onDragEnd?.(eventPoint(event));
        isDraggingRef.current = false;
        dragCandidateRef.current = undefined;
        updatePointerHit(false);
    }
    function handlePointerLeave() {
        if (dragCandidateRef.current)
            return;
        updatePointerHit(false);
    }
    function handleClick() {
        if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
        }
        if (onPointerHitChange && !isPointerHitRef.current)
            return;
        if (singleClickTimeoutRef.current !== undefined) {
            window.clearTimeout(singleClickTimeoutRef.current);
        }
        singleClickTimeoutRef.current = window.setTimeout(() => {
            singleClickTimeoutRef.current = undefined;
            onOpenPanel?.();
        }, 280);
    }
    function handleDoubleClick() {
        if (singleClickTimeoutRef.current !== undefined) {
            window.clearTimeout(singleClickTimeoutRef.current);
            singleClickTimeoutRef.current = undefined;
        }
        if (onPointerHitChange && !isPointerHitRef.current)
            return;
        onToggleListen?.();
    }
    function pointerHitTest(event) {
        return assetFailed ? fallbackHitTest(event) : canvasAlphaHitTest(event);
    }
    function eventPoint(event) {
        return {
            clientX: event.clientX,
            clientY: event.clientY,
            screenX: event.screenX,
            screenY: event.screenY
        };
    }
    function canvasAlphaHitTest(event) {
        const canvas = canvasRef.current;
        if (!canvas)
            return false;
        const rect = canvas.getBoundingClientRect();
        if (!isInsideRect(event.clientX, event.clientY, rect))
            return false;
        const context = canvas.getContext('2d');
        if (!context)
            return false;
        const visualX = event.clientX - rect.left;
        const sampleX = facing === 'right' ? rect.width - visualX : visualX;
        const sampleY = event.clientY - rect.top;
        const x = clamp(Math.floor((sampleX / rect.width) * canvas.width), 0, canvas.width - 1);
        const y = clamp(Math.floor((sampleY / rect.height) * canvas.height), 0, canvas.height - 1);
        try {
            return context.getImageData(x, y, 1, 1).data[3] > 24;
        }
        catch {
            return false;
        }
    }
    function fallbackHitTest(event) {
        const fallback = wrapperRef.current?.querySelector('.fallback-ann');
        if (!(fallback instanceof HTMLElement))
            return false;
        const rect = fallback.getBoundingClientRect();
        if (!isInsideRect(event.clientX, event.clientY, rect))
            return false;
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const head = Math.pow((x - 0.5) / 0.34, 2) + Math.pow((y - 0.38) / 0.24, 2) <= 1;
        const body = x >= 0.3 && x <= 0.7 && y >= 0.48 && y <= 0.86;
        return head || body;
    }
    return (_jsxs("div", { ref: wrapperRef, className: "companion-canvas companion-canvas-visible", onPointerDown: handlePointerDown, onPointerMove: handlePointerMove, onPointerUp: handlePointerUp, onPointerCancel: handlePointerCancel, onPointerLeave: handlePointerLeave, onClick: handleClick, onDoubleClick: handleDoubleClick, "aria-label": "Ann companion", children: [isListening && _jsx("div", { className: "companion-listening-indicator", "aria-label": "Listening" }), !assetFailed && (_jsxs("figure", { className: `canvas-ann canvas-ann-${animation.name} canvas-ann-facing-${facing} ${compact ? 'canvas-ann-compact' : ''}`, children: [_jsx("canvas", { ref: canvasRef }), _jsx("figcaption", { children: intentLabel(intent) })] })), assetFailed && _jsx(FallbackAnn, { intent: intent, compact: compact, facing: facing })] }));
}
function isInsideRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function selectAnimation(state) {
    if (!state)
        return annAnimations.idle_laptop;
    if (state.coreState === 'listening') {
        return annAnimations.think;
    }
    if (state.coreState === 'executing') {
        return annAnimations.focus_typing;
    }
    if (state.coreState === 'returning') {
        return annAnimations.return;
    }
    if (state.coreState === 'talking') {
        return annAnimations.talk;
    }
    if (state.intent === 'sharing_discovery' || state.coreState === 'discovering') {
        return annAnimations.discovery;
    }
    if (state.intent === 'reviewing_memory' ||
        state.intent === 'reflecting_journey' ||
        state.intent === 'organizing_backpack' ||
        state.coreState === 'thinking' ||
        state.coreState === 'observing') {
        return annAnimations.think;
    }
    if (state.intent === 'wandering' || state.coreState === 'walking') {
        return annAnimations.walk;
    }
    return annAnimations.idle_laptop;
}
function FallbackAnn({ intent, compact, facing }) {
    return (_jsxs("div", { className: `fallback-ann fallback-ann-facing-${facing} ${compact ? 'fallback-ann-compact' : ''}`, children: [_jsx("div", { className: "fallback-ann-shadow" }), _jsx("div", { className: "fallback-ann-tail" }), _jsx("div", { className: "fallback-ann-ear fallback-ann-ear-left" }), _jsx("div", { className: "fallback-ann-ear fallback-ann-ear-right" }), _jsx("div", { className: "fallback-ann-hair" }), _jsxs("div", { className: "fallback-ann-head", children: [_jsx("span", { className: "fallback-ann-eye fallback-ann-eye-left" }), _jsx("span", { className: "fallback-ann-eye fallback-ann-eye-right" }), _jsx("span", { className: "fallback-ann-mouth" })] }), _jsx("div", { className: "fallback-ann-body", children: _jsx("span", { className: "fallback-ann-laptop" }) }), _jsx("div", { className: "fallback-ann-label", children: intentLabel(intent) })] }));
}
function intentLabel(intent) {
    const labels = {
        waiting: 'quietly here',
        wandering: 'wandering',
        sharing_discovery: 'found something',
        helping_task: 'on task',
        asking_permission: 'listening',
        reviewing_memory: 'notebook',
        reflecting_journey: 'reflecting',
        organizing_backpack: 'packing notes'
    };
    return labels[intent] ?? intent;
}
