import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const MODEL_ID = 'Xenova/multilingual-e5-small';
const DIMENSIONS = 384;
const THRESHOLDS = {
  minGroundingSupportSimilarity: 0.87,
  undeclaredMemorySimilarity: 0.89,
  undeclaredMemoryCurrentTurnMargin: 0.12,
};

// Some source fixtures predate the repository's UTF-8 normalization and are
// stored as UTF-8 bytes interpreted as Windows-1252. Decode only those language
// entries at the corpus boundary so the model always receives real text.
const legacyEncodedLanguages = new Set(['zh-CN', 'zh-TW', 'ja', 'ko', 'mixed-en-zh']);
const windows1252Byte = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
  [0x2c6, 0x88], [0x2030, 0x89], [0x160, 0x8a], [0x2039, 0x8b], [0x152, 0x8c], [0x17d, 0x8e],
  [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x2dc, 0x98], [0x2122, 0x99], [0x161, 0x9a], [0x203a, 0x9b], [0x153, 0x9c], [0x17e, 0x9e], [0x178, 0x9f],
]);
const decodeWindows1252Utf8 = (text) => Buffer.from([...text].map((char) => {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) throw new Error('Unexpected empty calibration character.');
  return windows1252Byte.get(codePoint) ?? codePoint;
}), 'latin1').toString('utf8');
const corpusText = (text, language) => legacyEncodedLanguages.has(language) ? decodeWindows1252Utf8(text) : text;

// This is deliberately a compact, inspectable calibration corpus rather than
// generated text. It covers the production memory types, supported languages,
// provenance-relevant false-positive cases, and the exact E5 query/passage
// policy used by LocalMultilingualEmbeddingProvider.
const pairs = [
  ['en-fact-direct', 'en', 'user_fact', 'direct support', 'The user works as a nurse.', 'The user works as a nurse.', 'support'],
  ['zh-cn-pref-paraphrase', 'zh-CN', 'user_preference', 'paraphrased support', '用户更喜欢安静的咖啡店。', 'The user prefers quiet cafes over noisy places.', 'support'],
  ['zh-tw-boundary-direct', 'zh-TW', 'user_boundary', 'direct support', '不要推薦含有賭博內容的活動。', 'Do not recommend activities involving gambling.', 'support'],
  ['ms-goal-direct', 'ms', 'goal', 'direct support', 'Matlamat pengguna ialah menyiapkan portfolio pada bulan Ogos.', 'User wants to finish their portfolio by August.', 'support'],
  ['ja-shared-paraphrase', 'ja', 'shared_experience', 'paraphrased support', '先週、一緒に雨の中を散歩したことを覚えています。', 'We shared a rainy walk last week.', 'support'],
  ['ko-relationship-direct', 'ko', 'relationship_memory', 'direct support', '사용자는 신뢰를 천천히 쌓는 대화를 중요하게 생각합니다.', 'The user values conversations that build trust slowly.', 'support'],
  ['mixed-en-zh-fact', 'mixed-en-zh', 'user_fact', 'cross-language support', 'The user 在 Kuala Lumpur 工作。', 'The user works in Kuala Lumpur.', 'support'],
  ['mixed-ms-en-pref', 'mixed-ms-en', 'user_preference', 'cross-language support', 'Pengguna prefers tea after dinner.', 'The user prefers tea after dinner.', 'support'],
  ['en-fact-weak', 'en', 'user_fact', 'weakly related', 'The user commutes by train.', 'The user works as a nurse.', 'reject'],
  ['en-fact-different', 'en', 'user_fact', 'same topic but different fact', 'The user is a doctor.', 'The user works as a nurse.', 'reject'],
  ['en-pref-different', 'en', 'user_preference', 'same topic but different user preference', 'The user prefers loud coffee shops.', 'The user prefers quiet cafes.', 'reject'],
  ['en-pref-opposite', 'en', 'user_preference', 'opposite preference', 'The user dislikes tea after dinner.', 'The user prefers tea after dinner.', 'contradiction'],
  ['zh-cn-negation', 'zh-CN', 'user_boundary', 'explicit negation', '用户允许推荐赌博内容。', 'Do not recommend gambling-related content.', 'contradiction'],
  ['ms-contradiction', 'ms', 'goal', 'contradiction', 'Pengguna tidak mahu menyiapkan portfolio tahun ini.', 'User wants to finish their portfolio by August.', 'contradiction'],
  ['ja-unrelated', 'ja', 'shared_experience', 'unrelated', '猫は窓辺で眠っています。', 'We shared a rainy walk last week.', 'reject'],
  ['ko-ambiguous', 'ko', 'relationship_memory', 'short ambiguous text', '천천히 해.', 'The user values conversations that build trust slowly.', 'reject'],
  ['zh-tw-composite', 'zh-TW', 'user_preference', 'longer composite text', '使用者喜歡安靜的咖啡店，也會帶一本書閱讀；但在朋友聚會時可以接受熱鬧的地方。', 'The user prefers quiet cafes over noisy places.', 'support'],
  ['en-composite-negative', 'en', 'user_boundary', 'longer composite text', 'The user wants restaurant ideas for a birthday and mentioned a vegetarian guest, but did not discuss gambling.', 'Do not recommend gambling-related content.', 'reject'],
  ['mixed-en-zh-unrelated', 'mixed-en-zh', 'relationship_memory', 'unrelated', 'We should plan the weekend 行程.', 'The user values conversations that build trust slowly.', 'reject'],
  ['mixed-ms-en-negation', 'mixed-ms-en', 'user_boundary', 'explicit negation', 'Pengguna says gambling content is okay now.', 'Do not recommend gambling-related content.', 'contradiction'],
  ['en-goal-paraphrase', 'en', 'goal', 'paraphrased support', 'They plan to complete an August portfolio deadline.', 'User wants to finish their portfolio by August.', 'support'],
  ['zh-cn-fact-short', 'zh-CN', 'user_fact', 'short ambiguous text', '她是护士。', 'The user works as a nurse.', 'support'],
  ['ms-pref-weak', 'ms', 'user_preference', 'weakly related', 'Pengguna suka berjalan pada waktu pagi.', 'The user prefers tea after dinner.', 'reject'],
  ['ko-boundary-paraphrase', 'ko', 'user_boundary', 'paraphrased support', '도박을 권하지 마세요.', 'Do not recommend gambling-related content.', 'support'],
];

// These cases exercise the production undeclared-memory audit: a reply may
// resemble a selected memory only when that resemblance is materially stronger
// than its relationship to the current user message.
const undeclaredAuditCases = [
  ['nurse-undeclared', 'The user works as a nurse.', 'The user works as a nurse.', 'What is the weather like today?', true],
  ['boundary-undeclared', 'Do not recommend activities involving gambling.', 'Do not recommend gambling-related content.', 'Can you suggest a documentary?', true],
  ['tea-undeclared', 'The user prefers tea after dinner.', 'The user prefers tea after dinner.', 'What time is sunset?', true],
  ['goal-undeclared', 'The user wants to finish their portfolio by August.', 'User wants to finish their portfolio by August.', 'How can I organize my desk?', true],
  ['advice-current-turn', 'Take a short break and drink water.', 'Do not recommend gambling-related content.', 'I feel tired after work.', false],
  ['general-knowledge', 'Most houseplants need light and water.', 'The user works as a nurse.', 'How do I keep a houseplant healthy?', false],
  ['current-preference', 'Try a quiet cafe for reading.', 'The user prefers tea after dinner.', 'I am looking for a quiet cafe to read in.', false],
  ['mixed-current-turn', 'Please take a short walk and rest.', 'The user works in Kuala Lumpur.', 'Saya penat today and need a break.', false],
];

function cosine(left, right) {
  if (left.length !== DIMENSIONS || right.length !== DIMENSIONS) throw new Error(`LOCAL_EMBEDDING_DIMENSION_MISMATCH:${left.length}/${right.length}`);
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return { count: 0 };
  const at = (percentile) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile))];
  return { count: sorted.length, min: sorted[0], p50: at(0.5), p95: at(0.95), max: sorted.at(-1), mean: values.reduce((sum, value) => sum + value, 0) / values.length };
}

async function run() {
  const cacheDir = process.env.OUR_COMPANION_E5_CACHE;
  if (!cacheDir || !existsSync(cacheDir)) {
    console.error('E5 grounding QA setup required: set OUR_COMPANION_E5_CACHE to the installed local model cache. This command never downloads a model.');
    process.exitCode = 2;
    return;
  }

  const { env, pipeline } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;
  env.localModelPath = cacheDir;
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  const loadStarted = performance.now();
  const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' });
  const firstLoadMs = performance.now() - loadStarted;
  const embed = async (text, prefix) => {
    const result = await extractor(prefix + text.trim(), { pooling: 'mean', normalize: true, truncation: true, max_length: 512 });
    return Float32Array.from(result.data ?? []);
  };

  const observations = [];
  for (const [id, language, memoryType, category, claim, memory, expected] of pairs) {
    const started = performance.now();
    const score = cosine(
      await embed(corpusText(claim, language), 'query: '),
      await embed(corpusText(memory, language), 'passage: '),
    );
    observations.push({ id, language, memoryType, category, expected, score, latencyMs: performance.now() - started });
  }
  const positives = observations.filter((item) => item.expected === 'support');
  const negatives = observations.filter((item) => item.expected === 'reject');
  const contradictions = observations.filter((item) => item.expected === 'contradiction');
  const undeclaredAudit = [];
  for (const [id, reply, memory, currentUserMessage, expectedUndeclared] of undeclaredAuditCases) {
    const started = performance.now();
    const [replyVector, memoryVector, currentVector] = await Promise.all([
      embed(reply, 'query: '),
      embed(memory, 'passage: '),
      embed(currentUserMessage, 'query: '),
    ]);
    const memorySimilarity = cosine(replyVector, memoryVector);
    const currentTurnSimilarity = cosine(replyVector, currentVector);
    undeclaredAudit.push({ id, expectedUndeclared, memorySimilarity, currentTurnSimilarity, margin: memorySimilarity - currentTurnSimilarity, latencyMs: performance.now() - started });
  }
  const perLanguage = Object.fromEntries([...new Set(observations.map((item) => item.language))].map((language) => {
    const values = observations.filter((item) => item.language === language);
    return [language, { count: values.length, support: distribution(values.filter((item) => item.expected === 'support').map((item) => item.score)), nonSupport: distribution(values.filter((item) => item.expected !== 'support').map((item) => item.score)) }];
  }));

  console.log(JSON.stringify({
    modelId: MODEL_ID,
    modelDimensions: DIMENSIONS,
    timestamp: new Date().toISOString(),
    datasetSize: observations.length,
    textPolicy: { queryPrefix: 'query: ', documentPrefix: 'passage: ', pooling: 'mean', normalize: true, maxTokens: 512 },
    positiveScoreDistribution: distribution(positives.map((item) => item.score)),
    negativeScoreDistribution: distribution(negatives.map((item) => item.score)),
    contradictionScoreDistribution: distribution(contradictions.map((item) => item.score)),
    falseAcceptanceRate: negatives.concat(contradictions).filter((item) => item.score >= THRESHOLDS.minGroundingSupportSimilarity).length / (negatives.length + contradictions.length),
    falseRejectionRate: positives.filter((item) => item.score < THRESHOLDS.minGroundingSupportSimilarity).length / positives.length,
    perLanguage,
    firstLoadLatencyMs: firstLoadMs,
    averageInferenceLatencyMs: observations.reduce((sum, item) => sum + item.latencyMs, 0) / observations.length,
    undeclaredMemoryAudit: {
      cases: undeclaredAudit,
      undeclaredMarginDistribution: distribution(undeclaredAudit.filter((item) => item.expectedUndeclared).map((item) => item.margin)),
      allowedMarginDistribution: distribution(undeclaredAudit.filter((item) => !item.expectedUndeclared).map((item) => item.margin)),
    },
    selectedThresholds: THRESHOLDS,
    thresholdSelectionRationale: '0.87 is above the observed non-support maximum (0.8652), preferring safe false rejections over false Memory acceptance. 0.89 and a 0.12 margin retain all four explicit undeclared-memory audit cases while all four current-turn/general cases remain below both boundaries.',
    knownLimitations: ['This compact corpus supports release calibration but is not a demographic or safety benchmark.', 'The conservative support threshold rejects some multilingual paraphrases and therefore falls back or regenerates rather than accepting uncertain Memory.', 'Remote model access is disabled for this command.'],
    observations,
  }, null, 2));
}

run().catch((error) => {
  console.error(`E5 grounding QA failed without remote fallback: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
