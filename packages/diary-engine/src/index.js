import { createId, DEFAULT_CHARACTER_ID, nowIso } from '@our-companion/shared';
export function generateDailyDiary(context) {
    const lines = [
        'Today we kept exploring together.',
        context.savedDiscoveries.length > 0
            ? `I saved ${context.savedDiscoveries.length} discovery item${context.savedDiscoveries.length === 1 ? '' : 's'} into our trail.`
            : 'I did not find a discovery worth saving yet, so I stayed quiet and kept watching for better signals.',
        context.milestones.length > 0
            ? `The journey moved forward with ${context.milestones.length} small milestone${context.milestones.length === 1 ? '' : 's'}.`
            : 'The journey stayed gentle today.',
        context.memoryChanges.length > 0
            ? 'I updated my notebook so I can remember this more clearly next time.'
            : 'No major memory changes needed cleaning up.',
        'Little by little, the room feels more like ours.'
    ];
    return {
        id: createId('diary'),
        characterId: context.characterId ?? DEFAULT_CHARACTER_ID,
        type: 'daily',
        title: 'Quiet progress',
        content: lines.join('\n'),
        createdAt: nowIso()
    };
}
export function generateGrowthReflection(input) {
    const activeKnowledge = input.knowledge.filter((item) => item.status === 'active');
    const changedUnderstanding = activeKnowledge.slice(0, 5).map((item) => item.title);
    const milestoneSummary = input.milestones.length > 0
        ? `The journey gained ${input.milestones.length} meaningful milestone${input.milestones.length === 1 ? '' : 's'}.`
        : 'The journey did not need a milestone today.';
    return {
        id: createId('reflection'),
        title: input.period === 'weekly' ? 'Weekly growth reflection' : 'Daily growth reflection',
        summary: `${activeKnowledge.length} active knowledge item${activeKnowledge.length === 1 ? '' : 's'} shaped Ann's understanding. ${milestoneSummary}`,
        changedUnderstanding,
        whyItMattered: changedUnderstanding.length > 0
            ? 'These changes matter because Ann can connect future discoveries to persistent understanding instead of raw activity.'
            : 'Quiet periods matter too; Ann preserved attention instead of inventing progress.',
        relatedKnowledgeIds: activeKnowledge.map((item) => item.id),
        createdAt: nowIso()
    };
}
export function diaryFromReflection(reflection, characterId = DEFAULT_CHARACTER_ID) {
    return {
        id: createId('diary'),
        characterId,
        type: 'daily',
        title: reflection.title,
        content: [reflection.summary, ...reflection.changedUnderstanding.map((item) => `- ${item}`), reflection.whyItMattered].join('\n'),
        createdAt: nowIso()
    };
}
