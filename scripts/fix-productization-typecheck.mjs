import fs from 'node:fs';

const path = 'apps/desktop/electron/main/services.ts';
const source = fs.readFileSync(path, 'utf8');
const before = `    },
    listPendingActions: async () => {`;
const after = `    },
    getProactiveSettings: async (): Promise<ProactiveCompanionSettings> =>
      this.companionRuntime.getProactiveSettings(),
    updateProactiveSettings: async (input: ProactiveCompanionSettings): Promise<ProactiveCompanionSettings> =>
      this.companionRuntime.updateProactiveSettings(input),
    listPendingActions: async () => {`;
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`proactive service methods: expected one match, found ${count}`);
fs.writeFileSync(path, source.replace(before, after));
