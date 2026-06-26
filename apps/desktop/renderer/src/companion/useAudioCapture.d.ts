export interface AudioCaptureResult {
    blob: Blob;
    mimeType: string;
    durationMs: number;
}
export interface UseAudioCaptureOptions {
    silenceThreshold?: number;
    silenceDurationMs?: number;
    onSilenceStop?: () => void;
    onError?: (message: string) => void;
}
export declare function useAudioCapture(options?: UseAudioCaptureOptions): {
    startRecording: () => Promise<boolean>;
    stopRecording: () => Promise<AudioCaptureResult | undefined>;
    isRecording: () => boolean;
    cleanup: () => void;
};
