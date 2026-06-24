import type { DiaryEntry, Discovery, JourneyMilestone, MemoryNode } from '@our-companion/shared';
export interface DiaryContext {
    characterId?: string;
    milestones: JourneyMilestone[];
    savedDiscoveries: Discovery[];
    completedTasks: string[];
    memoryChanges: MemoryNode[];
}
export declare function generateDailyDiary(context: DiaryContext): DiaryEntry;
