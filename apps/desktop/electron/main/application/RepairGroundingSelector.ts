import type { OocViolation } from '@our-companion/shared';

export interface GroundingMemory { content: string; confidence: number; type: string; status: string; sensitivity?: string; updatedAt?: string; retrievalScore?: number; }
export interface RepairGroundingSelectorInput { userMessage: string; draftReply: string; violations: OocViolation[]; memories: GroundingMemory[]; maxItems: number; maxCharacters: number; }
const claimPattern = /(?:I remember|You told me|We discussed|\u6211\u8bb0\u5f97|\u4f60\u4e4b\u524d\u8bf4\u8fc7|\u6211\u4eec\u4e4b\u524d\u804a\u8fc7)\s*([^.!?\u3002\uff01\uff1f]{2,240})/iu;
export const MIN_REPAIR_GROUNDING_SCORE = 0.2;
function tokens(text: string): Set<string> { const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((value) => value.length > 1); const han = [...text.replace(/[^\p{Script=Han}]/gu, '')]; for (let i = 0; i + 1 < han.length; i += 1) words.push(`${han[i]}${han[i + 1]}`); return new Set(words); }
function score(query: Set<string>, memory: GroundingMemory): number { const value = tokens(memory.content); let hits = 0; for (const term of query) if (value.has(term)) hits += 1; return (hits / Math.max(1, query.size)) * .65 + memory.confidence * .2 + (memory.retrievalScore ?? 0) * .1 + (/user_fact|user_preference|goal/.test(memory.type) ? .05 : 0); }
export function selectRepairGrounding(input: RepairGroundingSelectorInput): string[] {
  if (input.violations.some((v) => v.type === 'identity_break' || v.type === 'prompt_or_tool_leak' || v.type === 'privacy_violation' || v.type === 'persona_contradiction')) return [];
  const claim = input.draftReply.match(claimPattern)?.[1] ?? input.userMessage;
  const query = tokens(claim);
  let count = 0; let characters = 0;
  return input.memories.filter((memory) => memory.status === 'active' && memory.sensitivity !== 'sensitive' && memory.sensitivity !== 'private')
    .map((memory) => ({ memory, score: score(query, memory) })).filter((item) => item.score >= MIN_REPAIR_GROUNDING_SCORE).sort((a, b) => b.score - a.score)
    .flatMap(({ memory }) => { const content = memory.content.slice(0, 400); if (count >= input.maxItems || characters + content.length > input.maxCharacters) return []; count += 1; characters += content.length; return [content]; });
}
