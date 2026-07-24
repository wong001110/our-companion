import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const cacheDir = process.env.OUR_COMPANION_E5_CACHE;
if (!cacheDir || !existsSync(cacheDir)) {
  console.error('E5 grounding QA setup required: set OUR_COMPANION_E5_CACHE to the installed local model cache. This command never downloads a model.');
  process.exitCode = 2;
} else {
  const { env, pipeline } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;
  env.localModelPath = cacheDir;
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  const started = performance.now();
  const extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' });
  const firstLoadMs = performance.now() - started;
  const pairs = [
    ['en', 'Do not recommend gambling-related content.', 'Do not recommend gambling-related content.', true],
    ['zh-CN', '不要推荐赌博相关内容。', 'Do not recommend gambling-related content.', true],
    ['zh-TW', '不要推薦賭博相關內容。', 'Do not recommend gambling-related content.', true],
    ['ms', 'Jangan cadangkan kandungan berkaitan perjudian.', 'Do not recommend gambling-related content.', true],
    ['ja', 'ギャンブル関連の内容をおすすめしないでください。', 'Do not recommend gambling-related content.', true],
    ['ko', '도박 관련 콘텐츠를 추천하지 마세요.', 'Do not recommend gambling-related content.', true],
    ['mixed-en-zh', 'Please 不要推荐 赌博 content.', 'Do not recommend gambling-related content.', true],
    ['mixed-ms-en', 'Jangan recommend gambling content.', 'Do not recommend gambling-related content.', true],
    ['negative', 'The user enjoys mountain hiking.', 'Do not recommend gambling-related content.', false],
  ];
  const embed = async (text, prefix) => {
    const result = await extractor(prefix + text, { pooling: 'mean', normalize: true, truncation: true, max_length: 512 });
    return result.data;
  };
  const cosine = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);
  const observations = [];
  for (const [language, claim, memory, expectedSupport] of pairs) {
    const start = performance.now();
    const score = cosine(await embed(claim, 'query: '), await embed(memory, 'passage: '));
    observations.push({ language, expectedSupport, score, latencyMs: performance.now() - start });
  }
  console.log(JSON.stringify({ modelId: 'Xenova/multilingual-e5-small', dimensions: 384, firstLoadMs, observations }, null, 2));
}
