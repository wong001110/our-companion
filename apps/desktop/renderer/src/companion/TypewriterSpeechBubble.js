import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { HOLD_AFTER_COMPLETE_MS, getMsPerWord, splitWords } from './typewriterSpeech';
export function TypewriterSpeechBubble({ message, onComplete }) {
    const [visibleText, setVisibleText] = useState('');
    const [isTyping, setIsTyping] = useState(true);
    const wordsRef = useRef([]);
    const indexRef = useRef(0);
    const timeoutRef = useRef(undefined);
    useEffect(() => {
        wordsRef.current = splitWords(message);
        indexRef.current = 0;
        setVisibleText('');
        setIsTyping(true);
        if (wordsRef.current.length === 0) {
            setIsTyping(false);
            onComplete?.();
            return;
        }
        const msPerWord = getMsPerWord(message);
        const tick = () => {
            const nextIndex = indexRef.current + 1;
            indexRef.current = nextIndex;
            setVisibleText(wordsRef.current.slice(0, nextIndex).join(' '));
            if (nextIndex >= wordsRef.current.length) {
                setIsTyping(false);
                timeoutRef.current = window.setTimeout(() => {
                    onComplete?.();
                }, HOLD_AFTER_COMPLETE_MS);
                return;
            }
            timeoutRef.current = window.setTimeout(tick, msPerWord);
        };
        timeoutRef.current = window.setTimeout(tick, msPerWord);
        return () => {
            if (timeoutRef.current !== undefined) {
                window.clearTimeout(timeoutRef.current);
            }
        };
    }, [message, onComplete]);
    if (!message)
        return null;
    return (_jsxs("div", { className: "speech-bubble speech-bubble-typing", "aria-live": "polite", children: [visibleText, isTyping && _jsx("span", { className: "speech-bubble-cursor", "aria-hidden": "true", children: "\u258D" })] }));
}
