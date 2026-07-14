import { t, type Lang } from '../i18n';
import { tabLabel, type Tab } from '../ui/utils';
import type { KeyboardEvent } from 'react';

const shortLabel: Record<Tab, string> = {
  home: 'H', chat: 'C', discovery: 'D', journey: 'J', memory: 'M', social: 'S', settings: '⚙',
};

export function ResponsiveNavigation({ tab, lang, onSelect, onExit }: { tab: Tab; lang: Lang; onSelect: (tab: Tab) => void; onExit: () => void }) {
  const items: Tab[] = ['home', 'chat', 'discovery', 'journey', 'memory', 'social', 'settings'];
  const activateFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, item: Tab) => {
    // Page transitions move focus to the incoming page heading. Native Space
    // activation happens on keyup, which can arrive after that focus move and
    // consequently never dispatch a click. Activate on keydown instead.
    if (event.key === ' ') {
      event.preventDefault();
      onSelect(item);
    }
  };
  return (
    <aside className="sidebar">
      <div className="brand-mark"><span>{t(lang, 'brand_name')}</span><small>{t(lang, 'brand_subtitle')}</small></div>
      <nav aria-label={t(lang, 'nav_primary')}>
        {items.map((item) => <button key={item} className={tab === item ? 'active' : ''} aria-label={tabLabel(item, lang)} aria-current={tab === item ? 'page' : undefined} data-short-label={shortLabel[item]} onClick={() => onSelect(item)} onKeyDown={(event) => activateFromKeyboard(event, item)}>{tabLabel(item, lang)}</button>)}
      </nav>
      <div className="sidebar-footer"><button className="sidebar-exit-btn" onClick={onExit}>{t(lang, 'nav_exit_app')}</button></div>
    </aside>
  );
}
