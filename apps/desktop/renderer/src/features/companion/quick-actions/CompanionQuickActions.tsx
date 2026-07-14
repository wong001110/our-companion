import { useEffect, useMemo, useRef, useState } from 'react';
import type { Rect } from '../../../companion/floatingPlacement';
import { QuickActionBubble } from './QuickActionBubble';
import { DEFAULT_QUICK_ACTION_PLACEMENTS, resolveQuickActionLayout, resolveQuickActionMenuLayout } from './quickActionLayout';
import { resolveInteractiveRegionLayout, type InteractiveRegionLayout } from '../../../companion/interactiveRegionLayout';
import { t } from '../../../i18n';
import { useLang } from '../../../ui/NotebookPrimitives';

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
};

const BUBBLE_SIZES = {
  talk: { width: 100, height: 38 },
  listen: { width: 108, height: 38 },
  panel: { width: 128, height: 38 },
  more: { width: 94, height: 38 },
};

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
}: CompanionQuickActionsProps) {
  const lang = useLang();
  const [moreOpen, setMoreOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => resolveQuickActionLayout({
    companionBounds: anchorRect,
    workArea: screenWorkArea,
    bubbleSizes: BUBBLE_SIZES,
    preferredPlacements: DEFAULT_QUICK_ACTION_PLACEMENTS,
  }), [anchorRect, screenWorkArea]);
  const morePlacement = layout.find((item) => item.id === 'more');
  const moreMenu = useMemo(() => morePlacement ? resolveQuickActionMenuLayout(morePlacement.rect, screenWorkArea) : undefined, [morePlacement, screenWorkArea]);
  const interactiveRegion = useMemo(() => resolveInteractiveRegionLayout(anchorRect, [...layout.map((item) => item.rect), ...(moreOpen && moreMenu ? [moreMenu.rect] : [])]), [anchorRect, layout, moreMenu, moreOpen]);

  useEffect(() => {
    if (!visible) setMoreOpen(false);
  }, [visible]);

  useEffect(() => {
    onInteractiveLayoutChange?.(visible ? interactiveRegion : undefined);
    return () => onInteractiveLayoutChange?.(undefined);
  }, [interactiveRegion, onInteractiveLayoutChange, visible]);

  useEffect(() => {
    if (!visible) return;
    const closeForEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMoreOpen(false);
        onClose?.();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      onClose?.();
    };
    window.addEventListener('keydown', closeForEscape);
    window.addEventListener('pointerdown', closeOutside);
    return () => {
      window.removeEventListener('keydown', closeForEscape);
      window.removeEventListener('pointerdown', closeOutside);
    };
  }, [visible, onClose]);

  if (!visible) return null;
  const byId = new Map(layout.map((item) => [item.id, item]));
  const execute = (action: () => void) => {
    setMoreOpen(false);
    action();
    onClose?.();
  };

  return (
    <div ref={rootRef} className="companion-quick-actions" data-testid="companion-quick-actions" data-interactive-region-count={interactiveRegion.bubbles.length + interactiveRegion.safePaths.length + 1} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {layout.map(({ id, side, rect }, index) => {
        const common = { side, style: { left: rect.x, top: rect.y, animationDelay: `${index * 42}ms` } };
        if (id === 'talk') return <QuickActionBubble key={id} {...common} active={talkOpen} data-testid="quick-action-talk" aria-pressed={talkOpen} onClick={() => execute(onTextChat)}>💬 {t(lang, 'quick_talk')}</QuickActionBubble>;
        if (id === 'listen') return <QuickActionBubble key={id} {...common} active={listening} data-testid="quick-action-listen" aria-pressed={listening} onClick={() => execute(onVoiceChat)}>🎙 {t(lang, 'quick_listen')}</QuickActionBubble>;
        if (id === 'panel') return <QuickActionBubble key={id} {...common} data-testid="quick-action-panel" onClick={() => execute(onOpenPanel)}>📖 {t(lang, 'quick_open_panel')}</QuickActionBubble>;
        return <QuickActionBubble key={id} {...common} active={moreOpen} data-testid="quick-action-more" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>••• {t(lang, 'quick_more')}</QuickActionBubble>;
      })}
      {moreOpen && byId.get('more') && moreMenu && (
        <div className={`quick-action-more-menu${moreMenu.opensAbove ? ' opens-above' : ''}`} role="menu" aria-label={t(lang, 'quick_more_actions')} style={{ left: moreMenu.rect.x, top: moreMenu.rect.y, width: moreMenu.rect.width }}>
          {onSwitchCompanion && <button role="menuitem" type="button" onClick={() => execute(onSwitchCompanion)}>{t(lang, 'quick_switch_companion')}</button>}
          {onOpenSettings && <button role="menuitem" type="button" onClick={() => execute(onOpenSettings)}>{t(lang, 'quick_settings')}</button>}
          {onExit && <button role="menuitem" type="button" className="quick-action-danger" onClick={() => execute(onExit)}>{t(lang, 'quick_exit_app')}</button>}
        </div>
      )}
    </div>
  );
}
