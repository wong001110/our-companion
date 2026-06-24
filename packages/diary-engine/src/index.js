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
