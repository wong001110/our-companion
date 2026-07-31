from pathlib import Path

path = Path(__file__).with_name('apply.py')
source = path.read_text(encoding='utf-8')
old = '''    """  action: (operation: () => Promise<unknown>, options?: { phase?: SocialMutationPhase }) => Promise<void>;
  refreshVisitOptions: () => Promise<void>;
}) {""",
    """  action: (operation: () => Promise<unknown>, options?: { phase?: SocialMutationPhase }) => Promise<void>;
  refreshVisitOptions: () => Promise<void>;
  onClearTerminalVisit: (sessionId: string) => void;
}) {""",'''
new = '''    """  action: (operation: () => Promise<unknown>, options?: { phase?: SocialMutationPhase }) => Promise<void>;
  refreshVisitOptions: () => Promise<void>;
}) {
  const sessions =""",
    """  action: (operation: () => Promise<unknown>, options?: { phase?: SocialMutationPhase }) => Promise<void>;
  refreshVisitOptions: () => Promise<void>;
  onClearTerminalVisit: (sessionId: string) => void;
}) {
  const sessions =""",'''
if source.count(old) != 1:
    raise SystemExit(f'apply.py anchor correction expected once, found {source.count(old)}')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
