type WhisperNativeResult = {
    transcription: string[][] | string[];
};
export declare function transcribeWithAddon(options: {
    fname_inp: string;
    model: string;
    language?: string;
    use_gpu?: boolean;
    no_prints?: boolean;
    translate?: boolean;
    no_timestamps?: boolean;
}): Promise<WhisperNativeResult>;
export {};
