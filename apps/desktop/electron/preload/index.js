import { contextBridge, ipcRenderer } from 'electron';
function invoke(channel, input) {
    return ipcRenderer.invoke(channel, input);
}
const api = {
    character: {
        getState: (characterId) => invoke('character:getState', characterId),
        getActive: () => invoke('character:getActive'),
        getBehaviorSettings: () => invoke('character:getBehaviorSettings'),
        updateBehaviorSettings: (input) => invoke('character:updateBehaviorSettings', input),
        setPrimary: (characterId) => invoke('character:setPrimary', characterId),
        updatePosition: (input) => invoke('character:updatePosition', input),
        triggerBehavior: (input) => invoke('character:triggerBehavior', input)
    },
    discovery: {
        getFeed: (input) => invoke('discovery:getFeed', input),
        refresh: (input) => invoke('discovery:refresh', input),
        markInterested: (discoveryId) => invoke('discovery:markInterested', discoveryId),
        markNotInterested: (discoveryId) => invoke('discovery:markNotInterested', discoveryId),
        addToJourney: (input) => invoke('discovery:addToJourney', input)
    },
    memory: {
        createNode: (input) => invoke('memory:createNode', input),
        updateNode: (input) => invoke('memory:updateNode', input),
        deleteNode: (id) => invoke('memory:deleteNode', id),
        createEdge: (input) => invoke('memory:createEdge', input),
        getGraph: (input) => invoke('memory:getGraph', input),
        search: (query) => invoke('memory:search', query)
    },
    journey: {
        create: (input) => invoke('journey:create', input),
        getActive: () => invoke('journey:getActive'),
        getTimeline: (input) => invoke('journey:getTimeline', input),
        addMilestone: (input) => invoke('journey:addMilestone', input)
    },
    diary: {
        getEntries: (input) => invoke('diary:getEntries', input),
        generateDaily: (input) => invoke('diary:generateDaily', input)
    },
    tool: {
        preview: (input) => invoke('tool:preview', input),
        execute: (input) => invoke('tool:execute', input)
    },
    ai: {
        getSettings: () => invoke('ai:getSettings'),
        updateSettings: (input) => invoke('ai:updateSettings', input),
        chat: (input) => invoke('ai:chat', input),
        generateDiscoveryReason: (input) => invoke('ai:generateDiscoveryReason', input),
        summarizeMemory: (input) => invoke('ai:summarizeMemory', input)
    },
    speech: {
        getStatus: () => invoke('speech:getStatus'),
        transcribe: (input) => invoke('speech:transcribe', input)
    },
    companion: {
        turn: (input) => invoke('companion:turn', input),
        onToggleListen: (listener) => {
            const channel = 'companion:toggleListen';
            const handler = () => listener();
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
    }
};
contextBridge.exposeInMainWorld('ourCompanion', api);
