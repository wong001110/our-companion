export type InspectorView =
  | 'overview'
  | 'context'
  | 'behavior'
  | 'thought'
  | 'memory'
  | 'journey'
  | 'discovery'
  | 'notebook'
  | 'conversation'
  | 'relationship'
  | 'notification';

export interface ObjectRef {
  id: string;
  type: string;
  label: string;
  data: Record<string, unknown>;
}

export interface CompanionOverview {
  name: string;
  runtimeState: string;
  presenceState: string;
  currentContext: string;
  currentBehavior: string;
  currentEmotion: string;
  relationshipStage: string;
  activeJourney?: string;
}
