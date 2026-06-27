import { createId, nowIso } from '@our-companion/shared';
import type { Topic } from './types';

export class TopicManager {
  private topics: Topic[] = [];

  getTopics(): Topic[] {
    return this.topics.map((t) => ({ ...t }));
  }

  getActiveTopics(): Topic[] {
    return this.topics.filter((t) => t.status === 'active').map((t) => ({ ...t }));
  }

  getCurrentTopic(): Topic | undefined {
    const active = this.getActiveTopics();
    return active.length > 0 ? active[active.length - 1] : undefined;
  }

  startTopic(title: string, relatedMemoryIds?: string[], relatedDiscoveryIds?: string[]): Topic {
    const topic: Topic = {
      id: createId('topic'),
      title,
      relatedMemoryIds,
      relatedDiscoveryIds,
      startedAt: nowIso(),
      lastMentionedAt: nowIso(),
      status: 'active',
    };
    this.topics.push(topic);
    return topic;
  }

  completeTopic(topicId: string): void {
    const topic = this.topics.find((t) => t.id === topicId);
    if (topic) {
      topic.status = 'completed';
    }
  }

  pauseTopic(topicId: string): void {
    const topic = this.topics.find((t) => t.id === topicId);
    if (topic) {
      topic.status = 'paused';
    }
  }

  resumeTopic(topicId: string): void {
    const topic = this.topics.find((t) => t.id === topicId);
    if (topic) {
      topic.status = 'active';
      topic.lastMentionedAt = nowIso();
    }
  }

  archiveTopic(topicId: string): void {
    const topic = this.topics.find((t) => t.id === topicId);
    if (topic) {
      topic.status = 'archived';
    }
  }

  findRelatedTopics(title: string): Topic[] {
    const words = title.toLowerCase().split(/\s+/).filter(Boolean);
    return this.topics.filter((topic) => {
      const topicWords = topic.title.toLowerCase().split(/\s+/);
      return words.some((w) => topicWords.includes(w));
    });
  }

  getFutureTopics(): Topic[] {
    return this.topics.filter((t) => t.status === 'paused');
  }

  getArchivedTopics(): Topic[] {
    return this.topics.filter((t) => t.status === 'archived');
  }
}
