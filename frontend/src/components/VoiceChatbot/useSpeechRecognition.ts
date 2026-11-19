import { useState, useEffect, useRef, useCallback } from 'react';

// Web Speech API interface declarations for TypeScript
interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export type PermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  errorMessage: string | null;
  permissionState: PermissionState;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  clearError: () => void;
}

export function useSpeechRecognition(onFinalResult?: (text: string) => void): UseSpeechRecognitionReturn {
  const isApiAvailable = typeof window !== 'undefined' && Boolean(
    (window as unknown as IWindow).SpeechRecognition || (window as unknown as IWindow).webkitSpeechRecognition
  );

  const [isSupported] = useState<boolean>(isApiAvailable);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState>(isApiAvailable ? 'prompt' : 'unsupported');

  const recognitionRef = useRef<any>(null);
  const onFinalResultRef = useRef(onFinalResult);

  useEffect(() => {
    onFinalResultRef.current = onFinalResult;
  }, [onFinalResult]);

  // Initialize SpeechRecognition on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const win = window as unknown as IWindow;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false; // Capture single utterance for clean turns
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMessage(null);
        setPermissionState('granted');
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let currentFinal = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) {
            currentFinal += text;
          } else {
            currentInterim += text;
          }
        }

        if (currentFinal) {
          const trimmed = currentFinal.trim();
          setTranscript(trimmed);
          setInterimTranscript('');
          if (onFinalResultRef.current) {
            onFinalResultRef.current(trimmed);
          }
        } else {
          setInterimTranscript(currentInterim);
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        const err = event.error;

        if (err === 'not-allowed') {
          setPermissionState('denied');
          setErrorMessage('Microphone access was denied. Please allow microphone permissions in your browser address bar.');
        } else if (err === 'no-speech') {
          setErrorMessage('No speech detected. Please speak into your microphone.');
        } else if (err === 'audio-capture') {
          setErrorMessage('No microphone was found on this device.');
        } else if (err === 'network') {
          setErrorMessage('Speech recognition network error. Please check your connection or use text.');
        } else if (err !== 'aborted') {
          setErrorMessage(`Speech recognition error: ${err}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (e: any) {
      console.warn('[useSpeechRecognition] Initialization error:', e);
    }

    // Check permission state via Permissions API if available
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((permissionStatus) => {
          setPermissionState(permissionStatus.state as PermissionState);
          permissionStatus.onchange = () => {
            setPermissionState(permissionStatus.state as PermissionState);
          };
        })
        .catch(() => {
          // Permissions API query not supported for microphone on some browsers
        });
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!isSupported || !recognitionRef.current) {
      setErrorMessage('Speech recognition is not supported in this browser. Please use text chat.');
      return;
    }

    setErrorMessage(null);
    setTranscript('');
    setInterimTranscript('');

    try {
      // First ensure media stream permission is triggered if prompt state
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
          setPermissionState('granted');
        } catch (mediaErr: any) {
          if (mediaErr.name === 'NotAllowedError' || mediaErr.name === 'PermissionDeniedError') {
            setPermissionState('denied');
            setErrorMessage('Microphone permission denied. Please allow microphone access in your browser settings.');
            return;
          }
        }
      }

      recognitionRef.current.start();
    } catch (err: any) {
      if (err.name !== 'InvalidStateError') {
        console.warn('[useSpeechRecognition] Failed to start:', err);
        setErrorMessage(err.message || 'Could not start microphone listening.');
      }
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
    }
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    errorMessage,
    permissionState,
    startListening,
    stopListening,
    resetTranscript,
    clearError,
  };
}
