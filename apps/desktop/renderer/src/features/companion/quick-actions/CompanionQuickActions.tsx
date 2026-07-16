import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Rect } from '../../../companion/floatingPlacement';
import { QuickActionBubble } from './QuickActionBubble';
import { DEFAULT_QUICK_ACTION_PLACEMENTS, resolveQuickActionLayout, resolveQuickActionMenuLayout } from './quickActionLayout';
import { resolveInteractiveRegionLayout, type InteractiveRegionLayout } from '../../../companion/interactiveRegionLayout';
import { t } from '../../../i18n';
import { useLang } from '../../../ui/NotebookPrimitives';
import { Presence } from '../../../components/motion/Presence';

export type CompanionQuickActionsProps = {
  visible: boolean;
  anchorRect: Rect;
  screenWorkArea: Rect;
  listening?: boolean;
  talkOpen?: boolean;
  onTextChat: () => void;
  onVoiceChat: () => void;
  onOpenPanel: () => void;
  onSwitchCompanion?: () => void;
  onOpenSettings?: () => void;
  onExit?: () => void;
  onClose?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onInteractiveLayoutChange?: (layout?: InteractiveRegionLayout) => void;
  extraInteractiveRects?: Rect[];
};

const BUBBLE_SIZES = {
  talk: { width: 100, height: 38 },
  listen: { width: 108, height: 38 },
  panel: { width: 128, height: 38 },
  more: { width: 94, height: 38 },
};
const FLOAT_TRAVEL_PX = 4;

export function CompanionQuickActions({
  visible,
  anchorRect,
  screenWorkArea,
  listening = false,
  talkOpen = false,
  onTextChat,
  onVoiceChat,
  onOpenPanel,
  onSwitchCompanion,
  onOpenSettings,
  onExit,
  onClose,
  onMouseEnter,
  onMouseLeave,
  onInteractiveLayoutChange,
  extraInteractiveRects = [],
}: CompanionQuickActionsProps) {
  const lang = useLang();
  const [moreOpen, setMoreOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const layout = useMemo(() => resolveQuickActionLayout({
    companionBounds: anchorRect,
    workArea: {
      x: screenWorkArea.x + FLOAT_TRAVEL_PX,
      y: screenWorkArea.y + FLOAT_TRAVEL_PX,
      width: Math.max(0, screenWorkArea.width - FLOAT_TRAVEL_PX * 2),
      height: Math.max(0, screenWorkArea.height - FLOAT_TRAVEL_PX * 2),
    },
    bubbleSizes: BUBBLE_SIZES,
    preferredPlacements: DEFAULT_QUICK_ACTION_PLACEMENTS,
  }), [anchorRect, screenWorkArea]);
  const morePlacement = layout.find((item) => item.id === 'more');
  const moreMenu = useMemo(() => morePlacement ? resolveQuickActionMenuLayout(morePlacement.rect, screenWorkArea) : undefined, [morePlacement, screenWorkArea]);
  const interactiveRegion = useMemo(() => resolveInteractiveRegionLayout(anchorRect, [...layout.map((item) => item.rect), ...(moreOpen && moreMenu ? [moreMenu.rect] : []), ...extraInteractiveRects]), [anchorRect, extraInteractiveRects, layout, moreMenu, moreOpen]);

  useEffect(() => {
    if (!visible) setMoreOpen(false);
  }, [visible]);

  useEffect(() => () => {
    if (closeTimerRef.current !== undefined) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    onInteractiveLayoutChange?.(visible ? interactiveRegion : undefined);
    return () => onInteractiveLayoutChange?.(undefined);
  }, [interactiveRegion, onInteractiveLayoutChange, visible]);

  useEffect(() => {
    if (!visible) return;
    const closeForEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (moreOpen) {
          setMoreOpen(false);
          rootRef.current?.querySelector<HTMLButtonElement>('[data-testid="quick-action-more"]')?.focus();
        } else onClose?.();
      }
    };
    window.addEventListener('keydown', closeForEscape);
    return () => {
      window.removeEventListener('keydown', closeForEscape);
    };
  }, [moreOpen, onClose, visible]);

  if (!visible) return null;
  const byId = new Map(layout.map((item) => [item.id, item]));
  const execute = (action: () => void, close = true, waitForMenuExit = false) => {
    setMoreOpen(false);
    action();
    if (!close) return;
    if (!waitForMenuExit) {
      onClose?.();
      return;
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = undefined;
      onClose?.();
    }, 140);
  };

  return (
    <div ref={rootRef} className="companion-quick-actions" data-testid="companion-quick-actions" data-interactive-region-count={interactiveRegion.bubbles.length + interactiveRegion.safePaths.length + 1} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {layout.map(({ id, side, rect }, index) => {
        const style = {
          left: rect.x,
          top: rect.y,
          animationDelay: `${index * 42}ms`,
          '--quick-action-float-delay': `${index * -240}ms`,
        } as CSSProperties;
        const common = { side, style };
        if (id === 'talk') return <QuickActionBubble key={id} {...common} active={talkOpen} data-testid="quick-action-talk" aria-pressed={talkOpen} onClick={() => execute(onTextChat, false)}>💬 {t(lang, 'quick_talk')}</QuickActionBubble>;
        if (id === 'listen') return <QuickActionBubble key={id} {...common} active={listening} data-testid="quick-action-listen" aria-pressed={listening} onClick={() => execute(onVoiceChat)}>🎙 {t(lang, 'quick_listen')}</QuickActionBubble>;
        if (id === 'panel') return <QuickActionBubble key={id} {...common} data-testid="quick-action-panel" onClick={() => execute(onOpenPanel)}>📖 {t(lang, 'quick_open_panel')}</QuickActionBubble>;
        return <QuickActionBubble key={id} {...common} active={moreOpen} data-testid="quick-action-more" aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((open) => !open)}>••• {t(lang, 'quick_more')}</QuickActionBubble>;
      })}
      <Presence present={moreOpen && Boolean(byId.get('more') && moreMenu)} exitDurationMs={140}>{(state) => moreMenu && (
        <div className={`quick-action-more-menu${moreMenu.opensAbove ? ' opens-above' : ''}`} data-motion-state={state} role="menu" aria-label={t(lang, 'quick_more_actions')} style={{ left: moreMenu.rect.x, top: moreMenu.rect.y, width: moreMenu.rect.width }}>
          {onSwitchCompanion && <button role="menuitem" type="button" onClick={() => execute(onSwitchCompanion, true, true)}>{t(lang, 'quick_switch_companion')}</button>}
          {onOpenSettings && <button role="menuitem" type="button" onClick={() => execute(onOpenSettings, true, true)}>{t(lang, 'quick_settings')}</button>}
          {onExit && <button role="menuitem" type="button" className="quick-action-danger" onClick={() => execute(onExit, true, true)}>{t(lang, 'quick_exit_app')}</button>}
        </div>
      )}</Presence>
    </div>
  );
}
