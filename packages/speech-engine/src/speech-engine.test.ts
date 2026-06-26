import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDiscoveryPresentationCard, createNotificationPayload, formatSpeechPayload } from './index.js';
import { getWhisperPaths, getWhisperStatus } from './paths.js';
import { ELECTRON_APP_NAME, getDefaultUserDataRoot } from './userDataPath.js';
import { transcribeAudioFile } from './whisperRunner.js';

const { transcribeWithAddonMock } = vi.hoisted(() => ({
  transcribeWithAddonMock: vi.fn()
}));

vi.mock('./whisperAddon.js', () => ({
  transcribeWithAddon: transcribeWithAddonMock
}));

beforeEach(() => {
  transcribeWithAddonMock.mockReset();
  transcribeWithAddonMock.mockResolvedValue({ transcription: ['hello'] });
});

describe('speech-engine paths', () => {
  it('resolves whisper model path under user data', () => {
    const paths = getWhisperPaths('C:/Users/demo/AppData/@our-companion/desktop');
    expect(paths.model).toContain('ggml-small.bin');
    expect(paths.modelDir).toContain('whisper');
  });

  it('reports missing model', async () => {
    const status = await getWhisperStatus('/missing/root', async () => null);
    expect(status.ready).toBe(false);
    expect(status.error).toContain('Whisper model is missing');
  });

  it('reports ready when model exists and is large enough', async () => {
    const paths = getWhisperPaths('/ready/root');
    const status = await getWhisperStatus('/ready/root', async (filePath) => {
      return filePath === paths.model ? 2 * 1024 * 1024 : null;
    });
    expect(status.ready).toBe(true);
  });

  it('reports missing when model file is too small', async () => {
    const paths = getWhisperPaths('/small/root');
    const status = await getWhisperStatus('/small/root', async (filePath) => {
      return filePath === paths.model ? 512 : null;
    });
    expect(status.ready).toBe(false);
  });
});

describe('speech-engine whisper runner', () => {
  it('does not use GPU by default', async () => {
    await transcribeAudioFile('/tmp/recording.wav', { modelPath: '/tmp/model.bin' });
    expect(transcribeWithAddonMock).toHaveBeenCalledWith(expect.objectContaining({ use_gpu: false }));
  });

  it('uses GPU when explicitly enabled', async () => {
    await transcribeAudioFile('/tmp/recording.wav', { modelPath: '/tmp/model.bin', useGpu: true });
    expect(transcribeWithAddonMock).toHaveBeenCalledWith(expect.objectContaining({ use_gpu: true }));
  });
});

describe('speech-engine userDataPath', () => {
  it('uses the Electron desktop app name', () => {
    expect(ELECTRON_APP_NAME).toBe('@our-companion/desktop');
  });

  it('resolves default user data root for the desktop app', () => {
    const root = getDefaultUserDataRoot();
    expect(root).toContain('@our-companion');
    expect(root).toContain('desktop');
  });
});

describe('speech-engine expression formatting', () => {
  it('changes bubble text with mood', () => {
    const payload = formatSpeechPayload({
      decision: { action: 'speak', reason: 'High growth discovery.' },
      characterState: { mood: 'curious' },
      discovery: {
        title: 'Local-first memory',
        summary: 'A practical pattern for companion memory.'
      }
    });

    expect(payload.text).toContain('thread worth tugging');
    expect(payload.actionLabel).toBe('view');
  });

  it('creates discovery cards and suppresses focus-mode notifications', () => {
    const card = createDiscoveryPresentationCard({
      id: 'disc_1',
      title: 'Memory architecture',
      summary: 'Useful reference.',
      source: 'github'
    });
    const notification = createNotificationPayload({
      decision: { action: 'speak', reason: 'High growth.' },
      title: card.title,
      body: card.summary,
      focusMode: true
    });

    expect(card.actions).toContain('save');
    expect(notification.shouldNotify).toBe(false);
  });
});
