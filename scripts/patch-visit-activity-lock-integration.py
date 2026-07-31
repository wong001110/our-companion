from pathlib import Path

path = Path('scripts/apply-visit-activity-lock.py')
source = path.read_text(encoding='utf-8')
old = "function approvedShareInput(input: PendingShare): VisitShareInput {"
new = "function approvedShareInput(pending: PendingShare): VisitShareInput {"
occurrences = source.count(old)
if occurrences != 2:
    raise SystemExit(f'expected 2 activity-lock anchors, found {occurrences}')
path.write_text(source.replace(old, new), encoding='utf-8')
