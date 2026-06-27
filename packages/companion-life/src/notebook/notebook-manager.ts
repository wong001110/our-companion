import { createId, nowIso } from '@our-companion/shared';
import type {
  NotebookSection,
  NotebookPage,
  PageType,
  NotebookState,
} from './types';

export class NotebookManager {
  private state: NotebookState = {
    pages: [],
    activeSection: 'home',
  };

  getState(): NotebookState {
    return {
      ...this.state,
      pages: this.state.pages.map((p) => ({ ...p })),
    };
  }

  getPages(section: NotebookSection): NotebookPage[] {
    return this.state.pages
      .filter((p) => p.section === section)
      .map((p) => ({ ...p }));
  }

  getPage(pageId: string): NotebookPage | undefined {
    return this.state.pages.find((p) => p.id === pageId);
  }

  createPage(
    section: NotebookSection,
    type: PageType,
    title: string,
    summary?: string,
    isReadOnly = false
  ): NotebookPage {
    const now = nowIso();
    const page: NotebookPage = {
      id: createId('page'),
      section,
      type,
      title,
      summary,
      cardIds: [],
      createdAt: now,
      lastModifiedAt: now,
      isReadOnly,
    };
    this.state.pages.push(page);
    return page;
  }

  addCardToPage(pageId: string, cardId: string): void {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (page && !page.cardIds.includes(cardId)) {
      page.cardIds.push(cardId);
      page.lastModifiedAt = nowIso();
    }
  }

  removeCardFromPage(pageId: string, cardId: string): void {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (page) {
      page.cardIds = page.cardIds.filter((id) => id !== cardId);
      page.lastModifiedAt = nowIso();
    }
  }

  linkPages(pageId: string, relatedPageId: string): void {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (page && !page.relatedPageIds?.includes(relatedPageId)) {
      page.relatedPageIds = [...(page.relatedPageIds ?? []), relatedPageId];
      page.lastModifiedAt = nowIso();
    }
  }

  search(query: string): NotebookPage[] {
    const lower = query.toLowerCase();
    return this.state.pages.filter(
      (p) =>
        p.title.toLowerCase().includes(lower) ||
        p.summary?.toLowerCase().includes(lower)
    );
  }

  getTimeline(limit = 20): NotebookPage[] {
    return [...this.state.pages]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  setActiveSection(section: NotebookSection): void {
    this.state.activeSection = section;
  }

  archivePage(pageId: string): void {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (page) {
      page.section = 'archive';
      page.lastModifiedAt = nowIso();
    }
  }
}
