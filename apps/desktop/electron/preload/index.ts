import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActionPermissionState,
  ActionPlan,
  AddDiscoveryToJourneyInput,
  AddJourneyMilestoneInput,
  BaseEvent,
  CharacterRuntimeState,
  ChatInput,
  ExplorationLoopEvent,
  CompanionAppendMessageInput,
  CompanionHistoryInput,
  CompanionSessionPhase,
  CreateJourneyInput,
  CreateMemoryEdgeInput,
  CreateMemoryNodeInput,
  DebugDataResetInput,
  DiscoveryAnnouncePayload,
  DiscoveryFeedInput,
  DiscoverySource,
  EngineSnapshotInput,
  FoundationEventLogInput,
  OurCompanionApi,
  PerformanceScript,
  StartExplorationInput,
  SubmitDiscoveryFeedbackInput,
  ToolExecuteInput,
  UpdateMemoryNodeInput
} from '@our-companion/shared';

function invoke<T>(channel: string, input?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, input) as Promise<T>;
}

const api: OurCompanionApi = {
  character: {
    getState: (characterId?: string) => invoke('character:getState', characterId),
    getActive: () => invoke('character:getActive'),
    getBehaviorSettings: () => invoke('character:getBehaviorSettings'),
    updateBehaviorSettings: (input) => invoke('character:updateBehaviorSettings', input),
    setPrimary: (characterId: string) => invoke('character:setPrimary', characterId),
    updatePosition: (input: { characterId?: string; x: number; y: number }) => invoke('character:updatePosition', input),
    triggerBehavior: (input: { characterId?: string; event: string }) => invoke('character:triggerBehavior', input),
    onStateChange: (listener: (state: CharacterRuntimeState) => void) => {
      const channel = 'character:stateChanged';
      const handler = (_event: Electron.IpcRendererEvent, state: CharacterRuntimeState) => listener(state);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    }
  },
  discovery: {
    getFeed: (input?: DiscoveryFeedInput) => invoke('discovery:getFeed', input),
    refresh: (input?: { sources?: DiscoverySource[] }) => invoke('discovery:refresh', input),
    markInterested: (discoveryId: string) => invoke('discovery:markInterested', discoveryId),
    markNotInterested: (discoveryId: string) => invoke('discovery:markNotInterested', discoveryId),
    addToJourney: (input: AddDiscoveryToJourneyInput) => invoke('discovery:addToJourney', input),
    onAnnounce: (listener: (payload: DiscoveryAnnouncePayload) => void) => {
      const channel = 'discovery:announce';
      const handler = (_event: Electron.IpcRendererEvent, payload: DiscoveryAnnouncePayload) => listener(payload);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    generateNow: () => invoke('discovery:generateNow'),
    shareNext: () => invoke('discovery:shareNext'),
    resetStatuses: () => invoke('discovery:resetStatuses'),
    countUnannounced: () => invoke('discovery:countUnannounced'),
    markSharedAsUnannounced: () => invoke('discovery:markSharedAsUnannounced'),
    clearPool: () => invoke('discovery:clearPool'),
    simulateCanAnnounceDisabled: (disabled: boolean) => invoke('discovery:simulateCanAnnounceDisabled', disabled),
    simulateInterruptEnabled: (enabled: boolean) => invoke('discovery:simulateInterruptEnabled', enabled),
    clearSimulation: () => invoke('discovery:clearSimulation'),
    getSimulationState: () => invoke('discovery:getSimulationState')
  },
  autonomy: {
    startExploration: (input?: StartExplorationInput) => invoke('autonomy:startExploration', input),
    getCurrentCycle: () => invoke('autonomy:getCurrentCycle'),
    getCycleHistory: (input?: { limit?: number }) => invoke('autonomy:getCycleHistory', input),
    submitFeedback: (input: SubmitDiscoveryFeedbackInput) => invoke('autonomy:submitFeedback', input),
    onExplorationEvent: (listener: (event: ExplorationLoopEvent) => void) => {
      const channel = 'autonomy:explorationEvent';
      const handler = (_event: Electron.IpcRendererEvent, payload: ExplorationLoopEvent) => listener(payload);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    }
  },
  memory: {
    createNode: (input: CreateMemoryNodeInput) => invoke('memory:createNode', input),
    updateNode: (input: UpdateMemoryNodeInput) => invoke('memory:updateNode', input),
    deleteNode: (id: string) => invoke('memory:deleteNode', id),
    createEdge: (input: CreateMemoryEdgeInput) => invoke('memory:createEdge', input),
    getGraph: (input?: { query?: string }) => invoke('memory:getGraph', input),
    search: (query: string) => invoke('memory:search', query)
  },
  journey: {
    create: (input: CreateJourneyInput) => invoke('journey:create', input),
    getActive: () => invoke('journey:getActive'),
    getTimeline: (input?: { journeyId?: string }) => invoke('journey:getTimeline', input),
    addMilestone: (input: AddJourneyMilestoneInput) => invoke('journey:addMilestone', input)
  },
  diary: {
    getEntries: (input?: { type?: 'daily' | 'weekly' | 'milestone'; limit?: number }) => invoke('diary:getEntries', input),
    generateDaily: (input?: { characterId?: string }) => invoke('diary:generateDaily', input)
  },
  tool: {
    preview: (input: ToolExecuteInput) => invoke('tool:preview', input),
    execute: (input: ToolExecuteInput) => invoke('tool:execute', input)
  },
  action: {
    plan: (text: string) => invoke('action:plan', text),
    executePlan: (plan: ActionPlan) => invoke('action:executePlan', plan),
    getPermissions: () => invoke('action:getPermissions'),
    updatePermissions: (state: ActionPermissionState) => invoke('action:updatePermissions', state),
    onPerformance: (listener: (script: PerformanceScript) => void) => {
      const channel = 'action:performanceStarted';
      const handler = (_event: Electron.IpcRendererEvent, script: PerformanceScript) => listener(script);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    }
  },
  ai: {
    getSettings: () => invoke('ai:getSettings'),
    updateSettings: (input) => invoke('ai:updateSettings', input),
    chat: (input: ChatInput) => invoke('ai:chat', input),
    generateDiscoveryReason: (input) => invoke('ai:generateDiscoveryReason', input),
    summarizeMemory: (input) => invoke('ai:summarizeMemory', input),
    getDebugLog: () => invoke('ai:getDebugLog')
  },
  speech: {
    getStatus: () => invoke('speech:getStatus'),
    getSettings: () => invoke('speech:getSettings'),
    updateSettings: (input) => invoke('speech:updateSettings', input),
    transcribe: (input) => invoke('speech:transcribe', input)
  },
  companion: {
    turn: (input) => invoke('companion:turn', input),
    getHistory: (input?: CompanionHistoryInput) => invoke('companion:getHistory', input),
    appendMessage: (input: CompanionAppendMessageInput) => invoke('companion:appendMessage', input),
    clearHistory: (input?: { characterId?: string }) => invoke('companion:clearHistory', input),
    reportSessionPhase: (phase: CompanionSessionPhase) => invoke('companion:reportSessionPhase', phase),
    reportDragging: (input: { dragging: boolean }) => invoke('companion:reportDragging', input),
    getOverlayDebug: () => invoke('companion:getOverlayDebug'),
    resizeToContent: (input: { x: number; y: number; width: number; height: number }) => invoke('companion:resizeToContent', input),
    onToggleListen: (listener: () => void) => {
      const channel = 'companion:toggleListen';
      const handler = () => listener();
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    }
  },
  debug: {
    resetData: (input: DebugDataResetInput) => invoke('debug:resetData', input),
    getFoundationLog: (input?: FoundationEventLogInput) => invoke('debug:getFoundationLog', input),
    getEngineSnapshot: (input?: EngineSnapshotInput) => invoke('debug:getEngineSnapshot', input),
    onFoundationEvent: (listener: (event: BaseEvent) => void) => {
      const channel = 'debug:foundationEvent';
      const handler = (_event: Electron.IpcRendererEvent, payload: BaseEvent) => listener(payload);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    }
  },
  window: {
    openPanel: () => invoke('window:openPanel'),
    getBounds: () => invoke('window:getBounds'),
    getWorkArea: () => invoke('window:getWorkArea'),
    moveTo: (input) => invoke('window:moveTo', input),
    setMousePassthrough: (input) => invoke('window:setMousePassthrough', input)
  },
  workspace: {
    getStatus: () => invoke('workspace:getStatus'),
    getSummary: () => invoke('workspace:getSummary'),
  }
};

contextBridge.exposeInMainWorld('ourCompanion', api);
