import type { InspectorView, CompanionOverview, ObjectRef } from './types';

export interface InspectorDeps {
  getOverview(): CompanionOverview;
  getContextData(): Record<string, unknown>;
  getBehaviorData(): Record<string, unknown>;
  getThoughtData(): Record<string, unknown>;
  getMemoryData(): Record<string, unknown>;
  getJourneyData(): Record<string, unknown>;
  getDiscoveryData(): Record<string, unknown>;
  getNotebookData(): Record<string, unknown>;
  getConversationData(): Record<string, unknown>;
  getRelationshipData(): Record<string, unknown>;
  getNotificationData(): Record<string, unknown>;
}

export class Inspector {
  private readonly deps: InspectorDeps;
  private currentView: InspectorView = 'overview';
  private frozen = false;
  private frozenData: Record<string, unknown> | null = null;
  private navigationStack: InspectorView[] = [];

  constructor(deps: InspectorDeps) {
    this.deps = deps;
  }

  getView(): InspectorView {
    return this.currentView;
  }

  setView(view: InspectorView): void {
    if (this.currentView !== view) {
      this.navigationStack.push(this.currentView);
    }
    this.currentView = view;
  }

  goBack(): InspectorView | undefined {
    const prev = this.navigationStack.pop();
    if (prev) this.currentView = prev;
    return prev;
  }

  isFrozen(): boolean {
    return this.frozen;
  }

  freeze(): void {
    this.frozen = true;
    this.frozenData = this.getViewData();
  }

  unfreeze(): void {
    this.frozen = false;
    this.frozenData = null;
  }

  getViewData(): Record<string, unknown> {
    if (this.frozen && this.frozenData) return this.frozenData;
    switch (this.currentView) {
      case 'overview': return this.deps.getOverview();
      case 'context': return this.deps.getContextData();
      case 'behavior': return this.deps.getBehaviorData();
      case 'thought': return this.deps.getThoughtData();
      case 'memory': return this.deps.getMemoryData();
      case 'journey': return this.deps.getJourneyData();
      case 'discovery': return this.deps.getDiscoveryData();
      case 'notebook': return this.deps.getNotebookData();
      case 'conversation': return this.deps.getConversationData();
      case 'relationship': return this.deps.getRelationshipData();
      case 'notification': return this.deps.getNotificationData();
      default: return {};
    }
  }

  navigateToObject(ref: ObjectRef): void {
    const viewMap: Record<string, InspectorView> = {
      memory: 'memory',
      journey: 'journey',
      discovery: 'discovery',
      notebook: 'notebook',
      conversation: 'conversation',
      relationship: 'relationship',
    };
    const target = viewMap[ref.type];
    if (target) this.setView(target);
  }
}
