import { useCallback, useEffect, useRef } from 'react';
const DEFAULT_SILENCE_THRESHOLD = 0.012;
const DEFAULT_SILENCE_DURATION_MS = 3000;
export function useAudioCapture(options = {}) {
    const streamRef = useRef(undefined);
    const recorderRef = useRef(undefined);
    const chunksRef = useRef([]);
    const audioContextRef = useRef(undefined);
    const analyserRef = useRef(undefined);
    const silenceFrameRef = useRef(undefined);
    const silenceStartedAtRef = useRef(undefined);
    const stopResolverRef = useRef(undefined);
    const recordingRef = useRef(false);
    const mimeTypeRef = useRef('audio/webm');
    const recordingStartedAtRef = useRef(undefined);
    const dataRequestIntervalRef = useRef(undefined);
    const silenceThreshold = options.silenceThreshold ?? DEFAULT_SILENCE_THRESHOLD;
    const silenceDurationMs = options.silenceDurationMs ?? DEFAULT_SILENCE_DURATION_MS;
    const releaseMedia = useCallback(() => {
        if (silenceFrameRef.current !== undefined) {
            cancelAnimationFrame(silenceFrameRef.current);
            silenceFrameRef.current = undefined;
        }
        if (dataRequestIntervalRef.current !== undefined) {
            window.clearInterval(dataRequestIntervalRef.current);
            dataRequestIntervalRef.current = undefined;
        }
        silenceStartedAtRef.current = undefined;
        recordingStartedAtRef.current = undefined;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = undefined;
        void audioContextRef.current?.close();
        audioContextRef.current = undefined;
        analyserRef.current = undefined;
        recordingRef.current = false;
    }, []);
    useEffect(() => releaseMedia, [releaseMedia]);
    const monitorSilence = useCallback(() => {
        const analyser = analyserRef.current;
        if (!analyser || !recordingRef.current)
            return;
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const sample of data) {
            const normalized = (sample - 128) / 128;
            sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        if (rms < silenceThreshold) {
            if (silenceStartedAtRef.current === undefined) {
                silenceStartedAtRef.current = now;
            }
            else if (now - silenceStartedAtRef.current >= silenceDurationMs) {
                options.onSilenceStop?.();
                return;
            }
        }
        else {
            silenceStartedAtRef.current = undefined;
        }
        silenceFrameRef.current = requestAnimationFrame(monitorSilence);
    }, [options, silenceDurationMs, silenceThreshold]);
    const startRecording = useCallback(async () => {
        if (recordingRef.current)
            return true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            const recorder = new MediaRecorder(stream, { mimeType });
            chunksRef.current = [];
            streamRef.current = stream;
            recorderRef.current = recorder;
            mimeTypeRef.current = mimeType;
            recordingRef.current = true;
            recordingStartedAtRef.current = performance.now();
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0)
                    chunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
                const durationMs = recordingStartedAtRef.current === undefined ? 0 : Math.max(0, performance.now() - recordingStartedAtRef.current);
                const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
                chunksRef.current = [];
                recorderRef.current = undefined;
                releaseMedia();
                stopResolverRef.current?.({ blob, mimeType: mimeTypeRef.current, durationMs });
                stopResolverRef.current = undefined;
            };
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            silenceStartedAtRef.current = undefined;
            recorder.start(250);
            dataRequestIntervalRef.current = window.setInterval(() => {
                if (recorder.state === 'recording') {
                    try {
                        recorder.requestData();
                    }
                    catch {
                        // Some MediaRecorder implementations may reject extra flushes; the next dataavailable still covers us.
                    }
                }
            }, 1000);
            silenceFrameRef.current = requestAnimationFrame(monitorSilence);
            return true;
        }
        catch {
            options.onError?.('I need microphone access to hear you.');
            releaseMedia();
            return false;
        }
    }, [monitorSilence, options, releaseMedia]);
    const stopRecording = useCallback(async () => {
        if (!recordingRef.current)
            return undefined;
        return new Promise((resolve) => {
            stopResolverRef.current = resolve;
            const recorder = recorderRef.current;
            if (!recorder || recorder.state === 'inactive') {
                releaseMedia();
                resolve(undefined);
                return;
            }
            try {
                recorder.requestData();
            }
            catch {
                // Final dataavailable is also emitted by stop().
            }
            recorder.stop();
        });
    }, [releaseMedia]);
    const isRecording = useCallback(() => recordingRef.current, []);
    return {
        startRecording,
        stopRecording,
        isRecording,
        cleanup: releaseMedia
    };
}
