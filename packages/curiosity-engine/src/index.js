import { DEFAULT_CHARACTER_ID, createId, nowIso } from '@our-companion/shared';
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.min(1, Math.max(0, value));
}
export function scoreCuriosity(parts) {
    const finalScore = clamp01(parts.memoryRelevance * 0.25 +
        parts.patternStrength * 0.25 +
        parts.novelty * 0.15 +
        parts.relationshipFit * 0.15 +
        parts.characterFit * 0.1 +
        parts.surprise * 0.1);
    return { ...parts, finalScore };
}
export function createCuriosityBudget(date, total = 100) {
    return {
        date,
        total,
        used: 0,
        remaining: total,
        allocations: {
            discovery: Math.round(total * 0.45),
            journey: Math.round(total * 0.25),
            reflection: Math.round(total * 0.15),
            conversation: total - Math.round(total * 0.45) - Math.round(total * 0.25) - Math.round(total * 0.15)
        }
    };
}
export function spendCuriosityBudget(budget, cost) {
    const used = Math.min(budget.total, budget.used + Math.max(0, Math.round(cost)));
    return {
        ...budget,
        used,
        remaining: Math.max(0, budget.total - used)
    };
}
export function calculateCuriosityMomentum(input) {
    return clamp01(0.5 + input.savedCount * 0.12 + (input.followUpCount ?? 0) * 0.1 - input.ignoredCount * 0.16);
}
export function assessCuriosity(input) {
    const bestGap = [...(input.gaps ?? [])]
        .filter((gap) => gap.status === 'open' || gap.status === 'exploring')
        .sort((left, right) => right.priority - left.priority)[0];
    const gapMatch = bestGap
        ? {
            gapId: bestGap.id,
            strength: clamp01(bestGap.priority * 0.7 + (input.novelty ?? 0.5) * 0.3),
            reason: `Matches curiosity gap: ${bestGap.description}`
        }
        : undefined;
    const growthValue = Math.round(Math.min(100, input.growthValue * (input.momentum ?? 1)));
    const budgetCost = Math.max(5, Math.round(growthValue / 12));
    return {
        id: createId('curiosity_assessment'),
        targetId: input.targetId,
        targetType: input.targetType,
        growthValue,
        gapMatch,
        budgetCost,
        reason: input.reason ?? gapMatch?.reason ?? 'Assessed by deterministic curiosity rules.'
    };
}
export function scoreCuriosityInvestment(input) {
    const score = clamp01(input.longTermValue * 0.24 +
        input.projectRelevance * 0.24 +
        input.knowledgeGap * 0.2 +
        input.userMomentum * 0.16 +
        input.novelty * 0.12 -
        input.diminishingReturns * 0.16);
    return {
        ...input,
        id: createId('curiosity_investment'),
        score,
        updatedAt: nowIso()
    };
}
function normalizedTitle(value) {
    return value
        .replace(/[^\w\s-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6)
        .join(' ');
}
function rejectedTopics(feedback = []) {
    return new Set(feedback
        .filter((item) => item.value === 'not_interested')
        .map((item) => item.note?.toLowerCase())
        .filter((item) => Boolean(item)));
}
function createTarget(input) {
    return {
        id: createId('curiosity'),
        userId: input.userId,
        companionId: input.companionId,
        topic: input.topic,
        description: input.description,
        source: input.source,
        explorationType: input.explorationType,
        priority: clamp01(input.priority),
        confidence: clamp01(input.confidence),
        reason: input.reason,
        expectedValue: input.expectedValue,
        relatedMemoryIds: input.relatedMemoryIds,
        relatedPatternIds: input.relatedPatternIds,
        relatedInterestNodeIds: input.relatedInterestNodeIds,
        createdAt: nowIso()
    };
}
export function generateCuriosityTargets(input) {
    const companionId = input.companionId ?? input.characterState.characterId ?? DEFAULT_CHARACTER_ID;
    const dismissed = rejectedTopics(input.recentFeedback);
    const memories = input.memoryNodes.filter((memory) => !memory.isMarkedWrong).slice(0, 8);
    const strongPatterns = [...input.patterns].sort((left, right) => right.strength - left.strength).slice(0, 5);
    const graphNodes = [...input.interestGraph.nodes].sort((left, right) => right.weight - left.weight).slice(0, 8);
    const targets = [];
    for (const memory of memories.slice(0, 3)) {
        const topic = normalizedTitle(memory.title || memory.summary || 'current project');
        if (!topic || dismissed.has(topic.toLowerCase()))
            continue;
        const score = scoreCuriosity({
            memoryRelevance: clamp01(memory.importanceScore / 100),
            patternStrength: strongPatterns[0]?.strength ?? 0.45,
            novelty: 0.55,
            relationshipFit: 0.72,
            characterFit: clamp01((input.characterState.emotion.curious ?? 35) / 100),
            surprise: 0.35
        });
        targets.push(createTarget({
            userId: input.userId,
            companionId,
            topic,
            description: `Explore what is adjacent to "${topic}" and may help the current work move forward.`,
            source: 'memory_trigger',
            explorationType: 'adjacent',
            priority: score.finalScore,
            confidence: Math.max(0.52, score.memoryRelevance),
            reason: `This came from an active memory Ann has been keeping: ${memory.summary ?? memory.title}.`,
            expectedValue: 'May reveal a nearby idea or reference that feels specifically useful now.',
            relatedMemoryIds: [memory.id]
        }));
    }
    for (const pattern of strongPatterns.slice(0, 3)) {
        const mode = pattern.type === 'contradiction' ? 'challenge' : 'deepening';
        targets.push(createTarget({
            userId: input.userId,
            companionId,
            topic: pattern.title,
            description: `Explore the pattern Ann noticed: ${pattern.summary}`,
            source: pattern.type === 'contradiction' ? 'contradiction_trigger' : 'pattern_trigger',
            explorationType: mode,
            priority: scoreCuriosity({
                memoryRelevance: 0.65,
                patternStrength: pattern.strength,
                novelty: pattern.freshness,
                relationshipFit: 0.75,
                characterFit: 0.7,
                surprise: pattern.type === 'contradiction' ? 0.85 : 0.45
            }).finalScore,
            confidence: pattern.confidence,
            reason: pattern.summary,
            expectedValue: pattern.type === 'contradiction'
                ? 'May help Ann challenge a hidden assumption before it becomes design debt.'
                : 'May help Ann understand the user beyond one isolated note.',
            relatedPatternIds: [pattern.id]
        }));
    }
    for (const node of graphNodes.slice(0, 3)) {
        const explorationType = node.type === 'technology' ? 'practical' : 'similar';
        targets.push(createTarget({
            userId: input.userId,
            companionId,
            topic: node.label,
            description: `Follow the interest graph around ${node.label}.`,
            source: 'journey_trigger',
            explorationType,
            priority: scoreCuriosity({
                memoryRelevance: node.weight,
                patternStrength: 0.55,
                novelty: node.freshness,
                relationshipFit: 0.68,
                characterFit: 0.7,
                surprise: explorationType === 'practical' ? 0.35 : 0.5
            }).finalScore,
            confidence: node.confidence,
            reason: `The interest graph shows ${node.label} as a meaningful ${node.type}.`,
            expectedValue: explorationType === 'practical' ? 'May produce directly buildable references.' : 'May uncover a nearby direction worth discussing.',
            relatedInterestNodeIds: [node.id]
        }));
    }
    if (targets.length === 0) {
        targets.push(createTarget({
            userId: input.userId,
            companionId,
            topic: 'Ambient AI companion interfaces',
            description: 'Explore AI interfaces that feel present without becoming a normal chat feed.',
            source: 'character_trigger',
            explorationType: 'adjacent',
            priority: 0.72,
            confidence: 0.62,
            reason: 'Ann is naturally curious, and the current product direction centers on companion presence.',
            expectedValue: 'May help Our Companion feel alive rather than like a regular assistant.'
        }));
    }
    return targets
        .sort((left, right) => right.priority - left.priority)
        .slice(0, 7);
}
// ============================================================================
// Curiosity Engine V2 — Enhanced curiosity management
// ============================================================================
export { CuriosityEngine } from './curiosity-engine';
export { scoreCandidatePriority, rankCandidates } from './curiosity-scoring';
export { generateFromMemories, generateFromPatterns, generateFromInsights, generateDefaultCandidate } from './candidate-generator';
export { addToQueue, removeFromQueue, getTopCandidates, deduplicateQueue, expireStaleCandidates, } from './queue-manager';
export { MIN_CANDIDATE_PRIORITY, MAX_CANDIDATES_IN_QUEUE, CANDIDATE_EXPIRY_DAYS, } from './types';
