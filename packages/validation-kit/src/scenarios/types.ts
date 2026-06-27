export type ScenarioCategory = 'experience' | 'development' | 'debug' | 'regression';

export interface Scenario {
  id: string;
  name: string;
  description: string;
  category: ScenarioCategory;
  version: string;
  compatibleVersion: string;
  createdAt: string;
  author: string;
  components: ScenarioComponent[];
}

export interface ScenarioComponent {
  type: string;
  data: Record<string, unknown>;
}

export interface ScenarioManifest {
  scenarios: Scenario[];
  version: string;
}
