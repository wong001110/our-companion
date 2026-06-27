export type NotebookSection =
  | 'home'
  | 'daily'
  | 'discoveries'
  | 'memories'
  | 'reflections'
  | 'journey'
  | 'archive';

export type PageType =
  | 'daily_page'
  | 'discovery_page'
  | 'memory_page'
  | 'journey_page'
  | 'reflection_page'
  | 'collection_page';

export interface NotebookPage {
  id: string;
  section: NotebookSection;
  type: PageType;
  title: string;
  summary?: string;
  cardIds: string[];
  relatedPageIds?: string[];
  createdAt: string;
  lastModifiedAt: string;
  isReadOnly: boolean;
}

export interface NotebookState {
  pages: NotebookPage[];
  activeSection: NotebookSection;
  searchQuery?: string;
}

export const SECTION_LABELS: Record<NotebookSection, string> = {
  home: 'Home',
  daily: 'Daily',
  discoveries: 'Discoveries',
  memories: 'Memories',
  reflections: 'Reflections',
  journey: 'Journey',
  archive: 'Archive',
};
