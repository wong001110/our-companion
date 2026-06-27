import type { SpeechInput, TranscriptResult, SpeechOutputRequest, SpeechAudioResult } from '@our-companion/shared';

export interface SpeechToTextProvider {
  transcribe(input: SpeechInput): Promise<TranscriptResult>;
}

export interface TextToSpeechProvider {
  synthesize(input: SpeechOutputRequest): Promise<SpeechAudioResult>;
}

export class MockSpeechToTextProvider implements SpeechToTextProvider {
  async transcribe(input: SpeechInput): Promise<TranscriptResult> {
    return {
      text: 'Mock transcription',
      language: input.language ?? 'en',
      confidence: 0.9,
    };
  }
}

export class MockTextToSpeechProvider implements TextToSpeechProvider {
  async synthesize(input: SpeechOutputRequest): Promise<SpeechAudioResult> {
    return {
      durationMs: input.text.length * 50,
    };
  }
}
