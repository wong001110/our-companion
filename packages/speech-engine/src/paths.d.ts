export declare const DEFAULT_MODEL_FILE = "ggml-small.bin";
export declare const MIN_MODEL_BYTES: number;
export interface WhisperPaths {
    root: string;
    modelDir: string;
    model: string;
}
export declare function getWhisperPaths(userDataRoot: string): WhisperPaths;
export interface WhisperStatus {
    ready: boolean;
    model: string;
    modelPath: string;
    error?: string;
}
export declare function getWhisperStatus(userDataRoot: string, stat?: (filePath: string) => Promise<number | null>): Promise<WhisperStatus>;
