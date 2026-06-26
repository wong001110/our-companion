import type { DiaryEntry, Discovery, JourneyMilestone, Knowledge, MemoryNode, Reflection } from '@our-companion/shared';
export interface DiaryContext {
    characterId?: string;
    milestones: JourneyMilestone[];
    savedDiscoveries: Discovery[];
    completedTasks: string[];
    memoryChanges: MemoryNode[];
}
export declare function generateDailyDiary(context: DiaryContext): DiaryEntry;
export declare function generateGrowthReflection(input: {
    knowledge: Knowledge[];
    milestones: JourneyMilestone[];
    period?: 'daily' | 'weekly';
}): Reflection;
export declare function diaryFromReflection(reflection: Reflection, characterId?: string): DiaryEntry;
