import fs from 'node:fs';

function replaceOnce(path, before, after, label) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  fs.writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  'apps/desktop/renderer/src/i18n/en.ts',
  "  settings_privacy_desc: 'Memory editing stays available from the Memories page whenever something needs correction.',",
  "  settings_privacy_desc: 'Use Memory Review to confirm, re-check, or pause what the Companion may use without rewriting evidence.',",
  'English privacy Memory copy',
);

replaceOnce(
  'apps/desktop/renderer/src/i18n/zh-CN.ts',
  '  "settings_privacy_desc": "当有需要更正的内容时，可以随时从回忆页面编辑记忆。",',
  '  "settings_privacy_desc": "请使用记忆查看来确认、重新核对或暂停伙伴可以使用的内容，而不是改写原始证据。",',
  'Simplified Chinese privacy Memory copy',
);
