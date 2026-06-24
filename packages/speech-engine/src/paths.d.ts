export declare const DEFAULT_MODEL_FILE = "ggml-tiny.en.bin";
export declare const WHISPER_BINARY_NAME: string;
export interface WhisperPaths {
    root: string;
    binDir: string;
    modelDir: string;
    binary: string;
    model: string;
}
export declare function getWhisperPaths(userDataRoot: string): WhisperPaths;
export interface WhisperStatus {
    ready: boolean;
    model: string;
    binaryPath: string;
    modelPath: string;
    error?: string;
}
export declare function getWhisperStatus(userDataRoot: string, exists?: (filePath: string) => Promise<boolean>): Promise<WhisperStatus>;
