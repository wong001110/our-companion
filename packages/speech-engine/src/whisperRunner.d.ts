export interface WhisperOptions {
    modelPath: string;
    language?: string;
    useGpu?: boolean;
}
export interface TranscribeResult {
    text: string;
    language?: string;
}
export declare function transcribeAudioFile(wavPath: string, options: WhisperOptions): Promise<TranscribeResult>;
