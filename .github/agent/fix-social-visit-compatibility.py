from pathlib import Path

path = Path('apps/desktop/electron/main/network/visitService.ts')
text = path.read_text(encoding='utf-8')
old = """  start = async (sessionId: string): Promise<VisitSessionSummary> => {
    await this.assertHostSessionAllowed(await this.network.getVisitSession(sessionId));
    const social = await this.network.getVisitSocialState(sessionId) as SocialVisitState;
    if (!social.share) throw new Error('VISIT_SHARE_REQUIRED');
    const updated = await this.network.startVisitSession(sessionId);"""
new = """  start = async (sessionId: string): Promise<VisitSessionSummary> => {
    await this.assertHostSessionAllowed(await this.network.getVisitSession(sessionId));
    const updated = await this.network.startVisitSession(sessionId);"""
if new not in text:
    if old not in text:
        raise SystemExit('Legacy Visit start patch anchor not found')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
Path('.github/agent/fix-social-visit-compatibility.py').unlink(missing_ok=True)
