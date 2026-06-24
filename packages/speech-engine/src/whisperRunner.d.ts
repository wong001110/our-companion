export interface WhisperOptions {
    binaryPath: string;
    modelPath: string;
    language?: string;
}
export interface TranscribeResult {
    text: string;
    language?: string;
}
export declare function transcribeAudioFile(wavPath: string, options: WhisperOptions): Promise<TranscribeResult>;
