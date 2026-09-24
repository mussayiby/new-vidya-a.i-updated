import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResult };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(options: {
  lang: string;
  onFinal: (text: string) => void;
}) {
  const { lang, onFinal } = options;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  const lastFinalRef = useRef("");
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const langRef = useRef(lang);
  langRef.current = lang;

  const normalizeFinal = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

  useEffect(() => {
    setSupported(Boolean(getRecognitionCtor()));
  }, []);

  const buildRecognition = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return null;
    const recognition = new Ctor();
    recognition.lang = langRef.current;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        const text = result[0].transcript.trim();
        if (!text) continue;
        if (result.isFinal) {
          const previous = lastFinalRef.current;
          const normalizedText = normalizeFinal(text);
          const normalizedPrevious = normalizeFinal(previous);
          if (!normalizedText || normalizedText === normalizedPrevious) continue;

          // Chrome may replay the prior final result after restarting recognition.
          // If it appends new words, publish only the new suffix instead of the
          // entire cumulative transcript.
          const nextText = normalizedPrevious && normalizedText.startsWith(normalizedPrevious)
            ? text.slice(previous.length).trim()
            : normalizedPrevious && normalizedPrevious.startsWith(normalizedText)
              ? ""
              : text;
          if (!nextText.trim()) continue;
          lastFinalRef.current = text;
          onFinalRef.current(nextText.trim());
        }
        else pending += ` ${text}`;
      }
      setInterim(pending.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wantListeningRef.current = false;
        setListening(false);
        setError(
          "Microphone access was blocked. Allow the microphone in your browser and try again.",
        );
        return;
      }
      setError(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      setInterim("");
      // Chrome stops automatically after a pause — restart while the teacher
      // still wants to be live.
      if (wantListeningRef.current) {
        try {
          recognition.start();
        } catch {
          setListening(false);
          wantListeningRef.current = false;
        }
      } else {
        setListening(false);
      }
    };

    return recognition;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      setError(
        "This browser does not support live speech recognition. Please use Chrome or Edge.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setError("Microphone permission is required to start the live class.");
      return;
    }
    const recognition = buildRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;
    lastFinalRef.current = "";
    wantListeningRef.current = true;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone. Try again.");
      wantListeningRef.current = false;
      setListening(false);
    }
  }, [buildRecognition]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setListening(false);
    setInterim("");
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return { listening, interim, error, supported, start, stop, setError };
}
