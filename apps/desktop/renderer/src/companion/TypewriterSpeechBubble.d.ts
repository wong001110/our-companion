export interface TypewriterSpeechBubbleProps {
    message: string;
    onComplete?: () => void;
}
export declare function TypewriterSpeechBubble({ message, onComplete }: TypewriterSpeechBubbleProps): import("react").JSX.Element | null;
