import type { OocViolation } from '@our-companion/shared';

export interface GroundingMemory { content: string; confidence: number; type: string; status: string; sensitivity?: string; updatedAt?: string; retrievalScore?: number; }
export interface RepairGroundingSelectorInput { userMessage: string; draftReply: string; violations: OocViolation[]; memories: GroundingMemory[]; maxItems: number; maxCharacters: number; }
const claimPattern = /(?:I remember|You told me|We discussed|\u6211\u8bb0\u5f97|\u4f60\u4e4b\u524d\u8bf4\u8fc7|\u6211\u4eec\u4e4b\u524d\u804a\u8fc7)\s*([^.!?\u3002\uff01\uff1f]{2,240})/iu;
export const MIN_REPAIR_GROUNDING_SCORE = 0.2;
export const MIN_RETRIEVAL_SCORE = 0.35;
function tokens(text: string): Set<string> { const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((value) => value.length > 1); const han = [...text.replace(/[^\p{Script=Han}]/gu, '')]; for (let i = 0; i + 1 < han.length; i += 1) words.push(`${han[i]}${han[i + 1]}`); return new Set(words); }
export interface RepairGroundingScore { lexicalOverlap: number; cjkOverlap: number; retrievalScore: number; confidenceScore: number; typeScore: number; total: number; }
function score(query: Set<string>, memory: GroundingMemory): RepairGroundingScore { const value = tokens(memory.content); let hits = 0; for (const term of query) if (value.has(term)) hits += 1; const lexicalOverlap = hits / Math.max(1, query.size); const queryHan = [...[...query].join('').replace(/[^\p{Script=Han}]/gu, '')]; const memoryHan = memory.content.replace(/[^\p{Script=Han}]/gu, ''); const grams = queryHan.slice(0, -1).map((char, index) => `${char}${queryHan[index + 1]}`); const cjkOverlap = grams.length ? grams.filter((gram) => memoryHan.includes(gram)).length / grams.length : 0; const retrievalScore = memory.retrievalScore ?? 0; const confidenceScore = memory.confidence; const typeScore = /user_fact|user_preference|goal/.test(memory.type) ? .05 : 0; return { lexicalOverlap, cjkOverlap, retrievalScore, confidenceScore, typeScore, total: Math.max(lexicalOverlap, cjkOverlap) * .65 + confidenceScore * .2 + retrievalScore * .1 + typeScore }; }
export function selectRepairGrounding(input: RepairGroundingSelectorInput): string[] {
  if (input.violations.some((v) => v.type === 'identity_break' || v.type === 'prompt_or_tool_leak' || v.type === 'privacy_violation' || v.type === 'persona_contradiction')) return [];
  const claim = input.draftReply.match(claimPattern)?.[1] ?? input.userMessage;
  const query = tokens(claim);
  let count = 0; let characters = 0;
  return input.memories.filter((memory) => memory.status === 'active' && memory.sensitivity !== 'sensitive' && memory.sensitivity !== 'private')
    .map((memory) => ({ memory, score: score(query, memory) })).filter((item) => (item.score.lexicalOverlap > 0 || item.score.cjkOverlap > 0 || item.score.retrievalScore >= MIN_RETRIEVAL_SCORE) && item.score.total >= MIN_REPAIR_GROUNDING_SCORE).sort((a, b) => b.score.total - a.score.total)
    .flatMap(({ memory }) => { const content = memory.content.slice(0, 400); if (count >= input.maxItems || characters + content.length > input.maxCharacters) return []; count += 1; characters += content.length; return [content]; });
}
