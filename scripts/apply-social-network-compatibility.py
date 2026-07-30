from pathlib import Path

path = Path('apps/desktop/electron/main/network/visitService.ts')
source = path.read_text(encoding='utf-8')
old = '''    const next = await this.network.appendVisitSocialTurn(sessionId, {
      clientTurnId: randomUUID(),
      intent: proposal.intent,
      message: proposal.message,
      emotion: proposal.emotion,
      topic: proposal.topic,
    }) as SocialVisitState;
    return {
      ...next,
      privateReflection: this.db?.getAppSetting<string>(`${REFLECTION_PREFIX}${sessionId}`),
    };'''
new = '''    const appended = await this.network.appendVisitSocialTurn(sessionId, {
      clientTurnId: randomUUID(),
      intent: proposal.intent,
      message: proposal.message,
      emotion: proposal.emotion,
      topic: proposal.topic,
    });
    // During a rolling deployment an older Network server returns only the
    // appended turn. Newer servers return the full state and save one request.
    const next = isSocialVisitState(appended)
      ? appended
      : await this.network.getVisitSocialState(sessionId) as SocialVisitState;
    return {
      ...next,
      privateReflection: this.db?.getAppSetting<string>(`${REFLECTION_PREFIX}${sessionId}`),
    };'''
if old not in source:
    raise SystemExit('respondSocial optimized response anchor not found')
source = source.replace(old, new, 1)
anchor = '''type PendingShare = {'''
helper = '''function isSocialVisitState(value: unknown): value is SocialVisitState {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<SocialVisitState>;
  return typeof record.sessionId === 'string'
    && typeof record.maxTurns === 'number'
    && Array.isArray(record.turns);
}

'''
if anchor not in source:
    raise SystemExit('SocialVisitState helper anchor not found')
source = source.replace(anchor, helper + anchor, 1)
path.write_text(source, encoding='utf-8')

test = Path('apps/desktop/electron/main/network/visitService.social.test.ts')
test_source = test.read_text(encoding='utf-8')
marker = "describe('VisitService social MVP', () => {"
if marker not in test_source:
    raise SystemExit('VisitService social test suite anchor not found')
if 'rolling Network deployment' not in test_source:
    test_source = test_source.replace(marker, marker + "\n  it('keeps a rolling Network deployment fallback for legacy turn responses', () => {\n    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'visitService.ts'), 'utf8');\n    expect(source).toContain('isSocialVisitState(appended)');\n    expect(source).toContain('getVisitSocialState(sessionId)');\n  });\n", 1)
    test.write_text(test_source, encoding='utf-8')
