import { CompanionEntryShell, PresenceActivityReporter } from '../app/CompanionEntryShell';
import { CreationShell } from '../app/CreationShell';
import { PanelShell } from '../app/PanelShell';
import { ToastProvider } from '../components/feedback/ToastProvider';

/** Selects the isolated renderer shell; each shell owns its own domain state. */
export function App() {
  const mode = new URLSearchParams(window.location.search).get('mode');
  return <ToastProvider><PresenceActivityReporter />{mode === 'panel' ? <PanelShell /> : mode === 'creation' ? <CreationShell /> : <CompanionEntryShell />}</ToastProvider>;
}
