export const FIXTURE_NORMAL_RESULTS = `<!doctype html>
<html><body><div id="links">
<div class="result"><a class="result__a" href="https://example.com/guide">Guide to pixel art</a><div class="result__snippet">Learn expressive pixel storytelling.</div></div>
<div class="result result--ad"><a class="result__a" href="https://ads.example.com/spam">Buy pixels</a></div>
<div class="result"><a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.example.com%2Ftools">Tools overview</a><div class="result__snippet">Recent tooling for indie games.</div></div>
<div class="result"><a class="result__a" href="https://example.com/guide">Duplicate guide</a></div>
<div class="result"><a class="result__a" href="javascript:alert(1)">Bad link</a></div>
</div></body></html>`;

export const FIXTURE_EMPTY_RESULTS = `<!doctype html><html><body><div class="msg">No results.</div></body></html>`;

export const FIXTURE_CHALLENGE_PAGE = `<!doctype html><html><head><title>Verify you are human</title></head><body>Please complete the CAPTCHA challenge.</body></html>`;

export const FIXTURE_RATE_LIMIT_PAGE = `<!doctype html><html><head><title>429 Too Many Requests</title></head><body>Too many requests from your network.</body></html>`;

export const FIXTURE_SLOW_PAGE = `<!doctype html><html><body><div id="links"></div><script>setTimeout(function(){document.querySelector('#links').innerHTML='<div class=\"result\"><a class=\"result__a\" href=\"https://slow.example.com\">Slow result</a></div>';},5000);</script></body></html>`;

export const FIXTURE_MALFORMED_LINKS = `<!doctype html><html><body><div class="result"><a class="result__a">Missing href</a></div></body></html>`;

export const FIXTURE_NAVIGATION_TRAP = `<!doctype html><html><body><a id="trap" href="https://evil.example.net/phish">trap</a></body></html>`;
