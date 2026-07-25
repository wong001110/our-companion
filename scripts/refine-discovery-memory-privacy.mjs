import fs from 'node:fs';

const path = 'apps/desktop/electron/main/services.ts';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  `        why_this_matters: relevanceTopics.length\n          ? \`\${input.discovery.title} connects with themes around \${relevanceTopics.join(', ')}.\`\n          : \`\${input.discovery.title} matches \${name}'s current curiosity.\`,`,
  `        why_this_matters: relevanceTopics.length\n          ? \`\${input.discovery.title} connects with a few themes that seem relevant.\`\n          : \`\${input.discovery.title} matches \${name}'s current curiosity.\`,`,
  'fallback theme privacy',
);
replaceOnce(
  `        tags: [...new Set([selectedCuriosityTarget.topic, ...(sourceMemoryAlignment?.publicHintTerms ?? [])])].slice(0, 4),`,
  `        tags: [selectedCuriosityTarget.topic],`,
  'visible discovery tags',
);

fs.writeFileSync(path, source);
