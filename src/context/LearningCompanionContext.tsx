import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApp } from "@/hooks/useApp";
import { tutorPersistenceService } from "@/services/tutor-persistence.service";
import { tutorService } from "@/services/tutor.service";
import type { TutorMessage } from "@/services/tutor-persistence.types";

export type LearningContext = {
  subjectId?: string;
  subject?: string;
  lesson?: string;
  topic?: string;
  activity?: string;
};

type CompanionStatus = "idle" | "loading" | "listening" | "thinking" | "speaking" | "error";

type LearningCompanionValue = {
  context: LearningContext;
  status: CompanionStatus;
  messages: TutorMessage[];
  error: string | null;
  online: boolean;
  setLearningContext: (context: LearningContext) => void;
  sendMessage: (message: string) => Promise<string | null>;
  setStatus: (status: CompanionStatus) => void;
  clearError: () => void;
};

const LearningCompanionContext = createContext<LearningCompanionValue | null>(null);
const SUBJECT_CONVERSATIONS_KEY = "vidya.companion.subjectConversations";

function getConversationMap(userId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(`${SUBJECT_CONVERSATIONS_KEY}.${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveConversationMap(userId: string, map: Record<string, string>): void {
  try {
    window.localStorage.setItem(`${SUBJECT_CONVERSATIONS_KEY}.${userId}`, JSON.stringify(map));
  } catch {
    // The server conversation remains authoritative when browser storage is unavailable.
  }
}

export function LearningCompanionProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useApp();
  const [context, setContext] = useState<LearningContext>({});
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [status, setStatus] = useState<CompanionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const setLearningContext = useCallback((nextContext: LearningContext) => {
    setContext((current) => ({ ...current, ...nextContext }));
  }, []);

  useEffect(() => {
    if (!user?.id || !context.subjectId) {
      setConversationId(null);
      setMessages([]);
      setStatus("idle");
      return;
    }

    let active = true;
    setStatus("loading");
    setError(null);

    const loadSubjectConversation = async () => {
      try {
        const map = getConversationMap(user.id);
        let nextConversationId = map[context.subjectId!];
        if (!nextConversationId) {
          const conversations = await tutorPersistenceService.listConversations();
          const conversation = conversations[0] ?? (await tutorPersistenceService.createConversation());
          nextConversationId = conversation.id;
          saveConversationMap(user.id, { ...map, [context.subjectId!]: nextConversationId });
        }
        const loadedMessages = await tutorPersistenceService.listMessages(nextConversationId);
        if (!active) return;
        setConversationId(nextConversationId);
        setMessages(loadedMessages);
        setStatus("idle");
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "The AI Teacher session could not load.");
        setStatus("error");
      }
    };

    void loadSubjectConversation();
    return () => {
      active = false;
    };
  }, [context.subjectId, user?.id]);

  const sendMessage = useCallback(async (message: string): Promise<string | null> => {
    const prompt = message.trim();
    if (!prompt) return null;
    if (!user?.id || !conversationId) {
      setError("The AI Teacher session is still loading. Please try again.");
      return null;
    }
    if (!online) {
      setError("You're offline. The AI Teacher needs internet, but downloaded lessons remain available.");
      return null;
    }

    setStatus("thinking");
    setError(null);
    try {
      await tutorPersistenceService.addMessage(conversationId, "user", prompt);
      const answer = await tutorService.ask({
        message: prompt,
        conversationId,
        language: profile.language || "en",
        learningContext: context,
      });
      setMessages(await tutorPersistenceService.listMessages(conversationId));
      setStatus("idle");
      return answer;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The AI Teacher could not respond.");
      setStatus("error");
      try {
        setMessages(await tutorPersistenceService.listMessages(conversationId));
      } catch {
        // Keep the current messages when the refresh also fails.
      }
      return null;
    }
  }, [conversationId, context, online, profile.language, user?.id]);

  const value = useMemo(() => ({
    context,
    status,
    messages,
    error,
    online,
    setLearningContext,
    sendMessage,
    setStatus,
    clearError: () => setError(null),
  }), [context, error, messages, online, sendMessage, setLearningContext, status]);

  return <LearningCompanionContext.Provider value={value}>{children}</LearningCompanionContext.Provider>;
}

export function useLearningCompanion(): LearningCompanionValue {
  const value = useContext(LearningCompanionContext);
  if (!value) throw new Error("useLearningCompanion must be used inside <LearningCompanionProvider>");
  return value;
}
