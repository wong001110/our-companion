import type { BrowserSearchChallenge } from './browserSearchTypes';

const CHALLENGE_PATTERNS: Array<{ kind: BrowserSearchChallenge['kind']; pattern: RegExp }> = [
  { kind: 'captcha', pattern: /\bcaptcha\b/i },
  { kind: 'captcha', pattern: /verify you are human/i },
  { kind: 'rate_limit', pattern: /unusual traffic/i },
  { kind: 'access_denied', pattern: /access denied/i },
  { kind: 'rate_limit', pattern: /too many requests/i },
  { kind: 'rate_limit', pattern: /automated queries blocked/i },
  { kind: 'rate_limit', pattern: /\b429\b/ },
];

export function detectBrowserSearchChallenge(input: {
  url: string;
  title: string;
  visibleText: string;
}): BrowserSearchChallenge | null {
  const haystack = `${input.title}\n${input.visibleText}\n${input.url}`.slice(0, 20_000);
  for (const entry of CHALLENGE_PATTERNS) {
    const match = haystack.match(entry.pattern);
    if (match) {
      return { kind: entry.kind, matchedText: match[0] ?? entry.pattern.source };
    }
  }
  return null;
}
