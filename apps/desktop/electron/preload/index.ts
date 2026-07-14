import { contextBridge, ipcRenderer } from 'electron';
import type {
  ActionPermissionState,
  ActionPlanV2,
  AddDiscoveryToJourneyInput,
  AddJourneyMilestoneInput,
  BaseEvent,
  CharacterRuntimeState,
  ChatInput,
  CompanionProfile,
  CreateCompanionInput,
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
  LoginUserInput,
  NetworkStatus,
  OnlineMode,
  OurCompanionApi,
  PerformanceScriptV2,
  RegisterUserInput,
  StartExplorationInput,
  SubmitDiscoveryFeedbackInput,
  ToolExecuteInput,
  UpdateCompanionInput,
  UpdateMemoryNodeInput,
  UserProfile
} from '@our-companion/shared';

let pendingCreationCompanion: CompanionProfile | null = null;
let pendingCreationStartupFailure: string | null = null;

function invoke<T>(channel: string, input?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, input) as Promise<T>;
}

const api: OurCompanionApi = {
  character: {
    getState: (characterId?: string) => invoke('character:getState', characterId),
    getActive: () => invoke('character:getActive'),
    getBehaviorSettings: (characterId?: string) => invoke('character:getBehaviorSettings', characterId),
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
    getNode: (id: string) => invoke('memory:getNode', id),
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
    executePlan: (plan: ActionPlanV2) => invoke('action:executePlan', plan),
    getPermissions: () => invoke('action:getPermissions'),
    updatePermissions: (state: ActionPermissionState) => invoke('action:updatePermissions', state),
    onPerformance: (listener: (script: PerformanceScriptV2) => void) => {
      const channel = 'action:performanceStarted';
      const handler = (_event: Electron.IpcRendererEvent, script: PerformanceScriptV2) => listener(script);
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
    getAttentionMode: () => invoke('companion:getAttentionMode'),
    setAttentionMode: (mode: 'available' | 'focused' | 'do_not_disturb') => invoke('companion:setAttentionMode', mode),
    listPendingActions: () => invoke('companion:listPendingActions'),
    cancelPendingAction: (id: string) => invoke('companion:cancelPendingAction', id),
    getActiveCommand: () => invoke('companion:getActiveCommand'),
    reportCommandAck: (ack: import('@our-companion/shared').CompanionCommandAck) =>
      invoke('companion:reportCommandAck', ack),
    onCommand: (listener: (command: import('@our-companion/shared').CompanionCommand) => void) => {
      const channel = 'companion:command';
      const handler = (_event: Electron.IpcRendererEvent, command: import('@our-companion/shared').CompanionCommand) =>
        listener(command);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    getOverlayDebug: () => invoke('companion:getOverlayDebug'),
    onDisplayChanged: (listener: (info: { workArea: { x: number; y: number; width: number; height: number }; display: { id: number; label: string; size: { width: number; height: number } } }) => void) => {
      const channel = 'companion:displayChanged';
      const handler = (_event: Electron.IpcRendererEvent, info: { workArea: { x: number; y: number; width: number; height: number }; display: { id: number; label: string; size: { width: number; height: number } } }) => listener(info);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    onToggleListen: (listener: () => void) => {
      const channel = 'companion:toggleListen';
      const handler = () => listener();
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    onRefresh: (listener: () => void) => {
      const channel = 'companion:refresh';
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
    openPanel: (input?: { companionX?: number; companionY?: number; initialTab?: 'home' | 'chat' | 'discovery' | 'journey' | 'memory' | 'social' | 'settings' }) => invoke('window:openPanel', input),
    openPanelForSwitch: () => invoke('window:openPanelForSwitch'),
    onPanelNavigate: (listener) => {
      const channel = 'panel:navigate';
      const handler = (_event: Electron.IpcRendererEvent, tab: 'home' | 'chat' | 'discovery' | 'journey' | 'memory' | 'social' | 'settings') => listener(tab);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    showCompanion: () => invoke('window:showCompanion'),
    getBounds: () => invoke('window:getBounds'),
    getWorkArea: () => invoke('window:getWorkArea'),
    setMousePassthrough: (input) => invoke('window:setMousePassthrough', input)
  },
  creation: {
    completed: (companion: CompanionProfile) => invoke<boolean>('creation:completed', companion),
    onCompleted: (listener: (companion: CompanionProfile) => void) => {
      const channel = 'creation:completed';
      const handler = (_event: Electron.IpcRendererEvent, companion: CompanionProfile) => {
        pendingCreationCompanion = companion;
        listener(companion);
      };
      ipcRenderer.on(channel, handler);
      if (pendingCreationCompanion) {
        listener(pendingCreationCompanion);
        pendingCreationCompanion = null;
      }
      return () => ipcRenderer.removeListener(channel, handler);
    },
    retryCompletion: () => invoke<boolean>('creation:retryCompletion'),
    onStartupFailed: (listener: (reason: string) => void) => {
      const channel = 'creation:startupFailed';
      const handler = (_event: Electron.IpcRendererEvent, reason: string) => {
        pendingCreationStartupFailure = reason;
        listener(reason);
      };
      ipcRenderer.on(channel, handler);
      if (pendingCreationStartupFailure) {
        listener(pendingCreationStartupFailure);
        pendingCreationStartupFailure = null;
      }
      return () => ipcRenderer.removeListener(channel, handler);
    },
    openWindow: () => invoke<boolean>('creation:openWindow'),
    closeWindow: () => invoke<boolean>('creation:closeWindow')
  },
  workspace: {
    getStatus: () => invoke('workspace:getStatus'),
    getSummary: () => invoke('workspace:getSummary'),
  },
  user: {
    getProfile: () => invoke<UserProfile | null>('user:getProfile'),
    register: (input: RegisterUserInput) => invoke<UserProfile>('user:register', input),
    login: (input: LoginUserInput) => invoke<UserProfile>('user:login', input),
    logout: () => invoke<void>('user:logout'),
    getMode: () => invoke<OnlineMode>('user:getMode'),
    setMode: (mode: OnlineMode) => invoke<OnlineMode>('user:setMode', mode),
    onModeChange: (listener: (mode: OnlineMode) => void) => {
      ipcRenderer.on('user:modeChanged', (_event, mode) => listener(mode));
      return () => { ipcRenderer.removeAllListeners('user:modeChanged'); };
    }
  },
  network: {
    getStatus: () => invoke<NetworkStatus>('network:getStatus'),
    configureServer: (serverUrl) => invoke<NetworkStatus>('network:configureServer', serverUrl),
    register: (input) => invoke<NetworkStatus>('network:register', input),
    login: (input) => invoke<NetworkStatus>('network:login', input),
    logout: () => invoke<NetworkStatus>('network:logout'),
    enableOnlineMode: () => invoke<NetworkStatus>('network:enableOnlineMode'),
    disableOnlineMode: () => invoke<NetworkStatus>('network:disableOnlineMode'),
    retryConnection: () => invoke<NetworkStatus>('network:retryConnection'),
    onStatusChanged: (listener) => {
      const channel = 'network:statusChanged';
      const handler = (_event: Electron.IpcRendererEvent, status: NetworkStatus) => listener(status);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    friends: {
      lookup: (friendCode) => invoke('network:friends:lookup', friendCode),
      getAll: () => invoke('network:friends:getAll'),
      getIncomingRequests: () => invoke('network:friends:getIncomingRequests'),
      getOutgoingRequests: () => invoke('network:friends:getOutgoingRequests'),
      sendRequest: (userId) => invoke('network:friends:sendRequest', userId),
      acceptRequest: (requestId) => invoke('network:friends:acceptRequest', requestId),
      rejectRequest: (requestId) => invoke('network:friends:rejectRequest', requestId),
      cancelRequest: (requestId) => invoke('network:friends:cancelRequest', requestId),
      remove: (userId) => invoke('network:friends:remove', userId),
    },
    blocks: { getAll: () => invoke('network:blocks:getAll'), block: (userId) => invoke('network:blocks:block', userId), unblock: (userId) => invoke('network:blocks:unblock', userId) },
    presence: { getFriendPresence: () => invoke('network:presence:getFriendPresence'), sendActivity: () => invoke('network:presence:sendActivity') },
    companions: {
      getMine: () => invoke('network:companions:getMine'),
      create: (input) => invoke('network:companions:create', input),
      update: (companionId, input) => invoke('network:companions:update', { companionId, profile: input }),
      activate: (companionId) => invoke('network:companions:activate', companionId),
      publish: (companionId) => invoke('network:companions:publish', companionId),
      unpublish: (companionId) => invoke('network:companions:unpublish', companionId),
      getFriendCompanion: (friendUserId) => invoke('network:companions:getFriend', friendUserId),
    },
    assets: {
      inspectLocalPack: (input) => invoke('network:assets:inspect', input), publishPack: (input) => invoke('network:assets:publish', input), cancelPublish: () => invoke('network:assets:cancelPublish'), cancelDownload: () => invoke('network:assets:cancelDownload'), getPublishStatus: () => invoke('network:assets:getPublishStatus'), downloadPack: (input) => invoke('network:assets:download', input), getCachedPack: (assetPackId) => invoke('network:assets:getCached', assetPackId), clearUnusedCache: () => invoke('network:assets:clearUnusedCache'),
    },
    visits: {
      invitations: {
        list: (input) => invoke('network:visits:invitations:list', input), send: (hostUserId) => invoke('network:visits:invitations:send', hostUserId), accept: (invitationId) => invoke('network:visits:invitations:accept', invitationId), decline: (invitationId) => invoke('network:visits:invitations:decline', invitationId), cancel: (invitationId) => invoke('network:visits:invitations:cancel', invitationId),
      },
      sessions: { list: () => invoke('network:visits:sessions:list'), get: (sessionId) => invoke('network:visits:sessions:get', sessionId), prepare: (sessionId) => invoke('network:visits:sessions:prepare', sessionId), start: (sessionId) => invoke('network:visits:sessions:start', sessionId), end: (sessionId) => invoke('network:visits:sessions:end', sessionId) },
      visual: {
        getState: () => invoke('network:visits:visual:getState'),
        reportRendererFailure: (sessionId) => invoke('network:visits:visual:reportRendererFailure', sessionId),
        onChanged: (listener) => {
          const channel = 'network:visits:visualChanged';
          const handler = (_event: Electron.IpcRendererEvent, state: import('@our-companion/shared').VisualVisitRendererState) => listener(state);
          ipcRenderer.on(channel, handler);
          return () => ipcRenderer.removeListener(channel, handler);
        },
      },
    },
  },
  app: {
    quit: () => invoke<boolean>('app:quit'),
    exitWithAnimation: () => invoke<boolean>('app:exitWithAnimation'),
    onExitAnimation: (listener: () => void) => {
      const channel = 'companion:exitAnimation';
      const handler = () => listener();
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    }
  },
  dialog: {
    openFiles: () => invoke<Array<{ name: string; dataUrl: string }>>('dialog:openFiles')
  },
  companionNew: {
    analyzePersonality: (description: string) => invoke<import('@our-companion/shared').CompanionPersonalityAnalysis>('companionNew:analyzePersonality', description),
    create: (input: CreateCompanionInput) => invoke<CompanionProfile>('companionNew:create', input),
    list: () => invoke<CompanionProfile[]>('companionNew:list'),
    get: (id: string) => invoke<CompanionProfile | null>('companionNew:get', id),
    update: (input: { id: string } & UpdateCompanionInput) => invoke<CompanionProfile>('companionNew:update', input),
    delete: (id: string) => invoke<{ id: string; deleted: true }>('companionNew:delete', id),
    setPrimary: (id: string) => invoke<CompanionProfile>('companionNew:setPrimary', id),
    getPrimary: () => invoke<CompanionProfile | null>('companionNew:getPrimary'),
    getAssetRoot: (id: string) => invoke<string>('companionNew:getAssetRoot', id),
    uploadAsset: (input: { companionId: string; fileName: string; buffer: ArrayBuffer }) => invoke<{ name: string; path: string }>('companionNew:uploadAsset', input),
    listAssets: (companionId: string) => invoke<Array<{ name: string; size: number; subfolder: string }>>('companionNew:listAssets', companionId),
    deleteAsset: (input: { companionId: string; subfolder: string; fileName: string }) => invoke<{ deleted: true }>('companionNew:deleteAsset', input),
    readAsset: (input: { companionId: string; subfolder: string; fileName: string }) => invoke<{ dataUrl: string } | null>('companionNew:readAsset', input)
  }
};

if (process.env.OUR_COMPANION_SMOKE_TEST === '1') {
  api.smoke = {
    getState: () => invoke('smoke:getState'),
    disconnectSocket: () => invoke('smoke:disconnectSocket'),
    reconcileVisits: () => invoke('smoke:reconcileVisits'),
    setOwnerPresenceMode: (mode) => invoke('smoke:setOwnerPresenceMode', mode),
    setVisualWorkArea: (input) => invoke('smoke:setVisualWorkArea', input),
    clearVisualWorkArea: () => invoke('smoke:clearVisualWorkArea'),
    reportVisualRuntime: (input) => invoke('smoke:reportVisualRuntime', input),
    simulateRendererFailure: () => invoke('smoke:simulateRendererFailure'),
    bootstrapFixtureCompanion: () => invoke('smoke:bootstrapFixtureCompanion'),
    onVisualWorkAreaChanged: (listener) => {
      const channel = 'smoke:visualWorkAreaChanged';
      const handler = (_event: Electron.IpcRendererEvent, workArea: { x: number; y: number; width: number; height: number } | undefined) => listener(workArea);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
  };
}

contextBridge.exposeInMainWorld('ourCompanion', api);
