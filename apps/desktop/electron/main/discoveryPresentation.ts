const ENGLISH_STOPWORDS = new Set([
  'about', 'after', 'before', 'from', 'into', 'with', 'without', 'that', 'this', 'these', 'those',
  'article', 'guide', 'using', 'through', 'recent', 'developments', 'evidence', 'ideas', 'approaches',
]);

export function compactDiscoveryTagsForStorage(
  values: readonly (string | undefined)[],
  maximumTags = 4,
): string[] {
  const tags: string[] = [];
  const normalizedMaximum = Math.max(1, Math.min(6, Math.floor(maximumTags)));

  for (const value of values) {
    if (!value) continue;
    const parts = value
      .normalize('NFKC')
      .split(/[，,。.!?！？;；|/:：—–()（）\[\]【】]+/u)
      .map((part) => part.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    for (const part of parts) {
      for (const tag of compactPart(part)) {
        const key = tag.toLocaleLowerCase();
        if (tags.some((existing) => existing.toLocaleLowerCase() === key)) continue;
        tags.push(tag);
        if (tags.length >= normalizedMaximum) return tags;
      }
    }
  }

  return tags;
}

function compactPart(value: string): string[] {
  const containsHan = /\p{Script=Han}/u.test(value);
  if (containsHan) {
    const chunks = value
      .split(/(?:以及|與|和|及|中的|关于|關於|如何|方法|经验|經驗|文章|指南|主题|主題)/u)
      .map((item) => item.replace(/[^\p{L}\p{N}]/gu, '').trim())
      .filter((item) => item.length >= 2);
    return (chunks.length ? chunks : [value.replace(/[^\p{L}\p{N}]/gu, '')])
      .map((item) => item.slice(0, 8))
      .filter((item) => item.length >= 2)
      .slice(0, 2);
  }

  const words = value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2 && !ENGLISH_STOPWORDS.has(word));
  if (!words.length) return [];
  return [words.slice(0, 3).join(' ').slice(0, 24)];
}
