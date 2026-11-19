import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseSpeechSynthesisReturn {
  isSupported: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  autoRead: boolean;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  pauseSpeaking: () => void;
  resumeSpeaking: () => void;
  toggleAutoRead: () => void;
}

/**
 * Strips markdown symbols, URLs, and code blocks for crisp speech synthesis
 */
function cleanTextForSpeech(raw: string): string {
  if (!raw) return '';

  return raw
    // Remove tips or footer notes in parentheses
    .replace(/\*\(Tip:.*?\)\*/gi, '')
    .replace(/\*\(Note:.*?\)\*/gi, '')
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove headers #, ##, etc.
    .replace(/#{1,6}\s+/g, '')
    // Remove bold / italics
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove backticks / code
    .replace(/`([^`]+)`/g, '$1')
    // Remove bullet characters
    .replace(/^\s*[-*+]\s+/gm, '')
    // Replace multiple newlines with single periods for natural pauses
    .replace(/\n+/g, '. ')
    // Normalize spaces
    .replace(/\s+/g, ' ')
    .trim();
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const isApiAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const [isSupported] = useState<boolean>(isApiAvailable);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoRead, setAutoRead] = useState<boolean>(true);

  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const currentUtterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const keepAliveIntervalRef = useRef<any>(null);

  // Initialize SpeechSynthesis voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const updateVoices = () => {
      const available = window.speechSynthesis.getVoices();
      voicesRef.current = available;
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;

    return () => {
      if (keepAliveIntervalRef.current) clearInterval(keepAliveIntervalRef.current);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
    currentUtterancesRef.current = [];
    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  const pauseSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && isSpeaking) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isSpeaking]);

  const resumeSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, [isPaused]);

  const toggleAutoRead = useCallback(() => {
    setAutoRead((prev) => {
      const next = !prev;
      if (!next) {
        stopSpeaking();
      }
      return next;
    });
  }, [stopSpeaking]);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

      // Always cancel active speech before starting new one
      stopSpeaking();

      const cleaned = cleanTextForSpeech(text);
      if (!cleaned) return;

      // Split into sentences for better speech flow and Chrome reliability
      const sentences = cleaned.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [cleaned];
      const validChunks = sentences.map((s) => s.trim()).filter(Boolean);

      if (validChunks.length === 0) return;

      // Pick preferred English voice
      const voices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find((v) => v.lang.includes('en-IN') && (v.name.includes('Google') || v.name.includes('Natural'))) ||
        voices.find((v) => v.lang.includes('en-US') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Jenny'))) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0] ||
        null;

      const utterances: SpeechSynthesisUtterance[] = [];

      validChunks.forEach((chunk, index) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        // When the final chunk finishes, update speaking state
        if (index === validChunks.length - 1) {
          utterance.onend = () => {
            setIsSpeaking(false);
            setIsPaused(false);
            if (keepAliveIntervalRef.current) {
              clearInterval(keepAliveIntervalRef.current);
              keepAliveIntervalRef.current = null;
            }
          };
        }

        utterance.onerror = (e) => {
          if (e.error !== 'canceled' && e.error !== 'interrupted') {
            console.warn('[useSpeechSynthesis] Utterance error:', e.error);
          }
          if (index === validChunks.length - 1) {
            setIsSpeaking(false);
            setIsPaused(false);
          }
        };

        utterances.push(utterance);
      });

      currentUtterancesRef.current = utterances;
      setIsSpeaking(true);
      setIsPaused(false);

      // Chrome bug workaround: keepalive pause/resume every 14 seconds to prevent speech freezing
      keepAliveIntervalRef.current = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 14000);

      utterances.forEach((u) => window.speechSynthesis.speak(u));
    },
    [stopSpeaking]
  );

  return {
    isSupported,
    isSpeaking,
    isPaused,
    autoRead,
    speak,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    toggleAutoRead,
  };
}
