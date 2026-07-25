from pathlib import Path

path = Path('apps/desktop/electron/main/network/visitService.ts')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        """  start = async (sessionId: string): Promise<VisitSessionSummary> => {
    await this.assertHostSessionAllowed(await this.network.getVisitSession(sessionId));
    const social = await this.network.getVisitSocialState(sessionId) as SocialVisitState;
    if (!social.share) throw new Error('VISIT_SHARE_REQUIRED');
    const updated = await this.network.startVisitSession(sessionId);""",
        """  start = async (sessionId: string): Promise<VisitSessionSummary> => {
    await this.assertHostSessionAllowed(await this.network.getVisitSession(sessionId));
    const updated = await this.network.startVisitSession(sessionId);""",
    ),
    (
        """  private attachApprovedShare = async (session: VisitSessionSummary): Promise<void> => {
    if (!this.db) throw new Error('VISIT_SOCIAL_LOCAL_STORE_UNAVAILABLE');
    const existing = await this.network.getVisitSocialState(session.id) as SocialVisitState;
    if (existing.share) return;
    const pending = this.db.getAppSetting<PendingShare>(`${PENDING_SHARE_PREFIX}${session.invitationId}`);
    if (!pending) throw new Error('VISIT_SHARE_REQUIRED');""",
        """  private attachApprovedShare = async (session: VisitSessionSummary): Promise<void> => {
    if (!this.db) return;
    const existing = await this.network.getVisitSocialState(session.id) as SocialVisitState;
    if (existing.share) return;
    const pending = this.db.getAppSetting<PendingShare>(`${PENDING_SHARE_PREFIX}${session.invitationId}`);
    if (!pending) return;""",
    ),
]

for old, new in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit('Legacy Visit compatibility patch anchor not found')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
Path('.github/agent/fix-social-visit-compatibility.py').unlink(missing_ok=True)
