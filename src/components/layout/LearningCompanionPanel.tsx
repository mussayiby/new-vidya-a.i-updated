import { useEffect, useState } from "react";
import { ChevronDown, Lightbulb, Mic, MicOff, Send, Sparkles, Volume2, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useLearningCompanion } from "@/context/LearningCompanionContext";
import { tutorService } from "@/services/tutor.service";
import type { TutorMessage } from "@/services/tutor-persistence.types";

function speechLanguage(language: string): string {
  const map: Record<string, string> = { en: "en-US", hi: "hi-IN", kn: "kn-IN", bn: "bn-IN", mr: "mr-IN", te: "te-IN", ta: "ta-IN", gu: "gu-IN", ml: "ml-IN" };
  return map[language] ?? "en-US";
}

export function LearningCompanionPanel() {
  const { user, profile } = useApp();
  const { context, status, messages, error, online, sendMessage, setStatus } = useLearningCompanion();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const speak = async (text: string) => {
    if (!online) return;
    const language = profile.language || "en";
    if (["bn", "gu", "hi", "kn", "ml", "mr", "ta", "te"].includes(language)) {
      try {
        setStatus("speaking");
        const url = await tutorService.speak(text, language);
        setAudioUrl(url);
        const audio = new Audio(url);
        audio.onended = () => { setSpeaking(false); setStatus("idle"); URL.revokeObjectURL(url); };
        audio.onerror = () => { setSpeaking(false); setStatus("idle"); };
        setSpeaking(true);
        await audio.play();
        return;
      } catch {
        // Browser speech remains the real fallback when local Indic-TTS is unavailable.
      }
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = speechLanguage(language);
      utterance.onstart = () => { setSpeaking(true); setStatus("speaking"); };
      utterance.onend = () => { setSpeaking(false); setStatus("idle"); };
      utterance.onerror = () => { setSpeaking(false); setStatus("idle"); };
      window.speechSynthesis.speak(utterance);
    }
  };

  const speech = useSpeechRecognition({
    lang: speechLanguage(profile.language || "en"),
    onFinal: (text) => { setDraft(""); void submit(text); },
  });

  useEffect(() => () => {
    speech.stop();
    window.speechSynthesis?.cancel();
  }, [speech.stop]);

  const submit = async (text = draft) => {
    const answer = await sendMessage(text);
    if (answer) void speak(answer);
    setDraft("");
  };

  if (!user || !context.subjectId) return null;
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const visibleMessages = messages.slice(-4);

  return <aside className={`fixed right-4 bottom-4 z-40 w-[min(380px,calc(100vw-2rem))] rounded-3xl border border-[#d9b14e] bg-[#fffaf0] shadow-[0_20px_60px_rgba(54,39,15,0.2)] transition-all ${open ? "" : "overflow-hidden"}`} aria-label="AI Teacher companion"><button type="button" className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span className="grid size-11 place-items-center rounded-2xl bg-[#1f493e] text-[#f4c66d]"><Sparkles className="size-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black">Your AI Teacher</span><span className="block truncate text-xs text-slate-500">{context.subject} · {context.topic || context.lesson || "Learning"}</span></span>{online ? <span className={`size-2 rounded-full ${status === "thinking" ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`} /> : <WifiOff className="size-4 text-amber-600" />}{open ? <ChevronDown className="size-4" /> : <span className="text-xs font-bold text-primary">Ask me</span>}</button>{open ? <div className="border-t border-[#ead9ae] p-4"><div className="mb-3 flex items-center justify-between text-xs text-slate-500"><span>{status === "thinking" ? "Understanding..." : speaking ? "Speaking..." : speech.listening ? "Listening..." : online ? "I’m here with you." : "Offline lesson support"}</span><button type="button" onClick={() => setOpen(false)} aria-label="Minimize AI Teacher"><X className="size-4" /></button></div>{context.activity ? <p className="mb-3 rounded-xl bg-[#fff0cf] p-3 text-xs text-[#62491f]">We are in <strong>{context.activity}</strong>. Ask anything about this learning step.</p> : null}<div className="max-h-48 space-y-2 overflow-y-auto">{visibleMessages.length ? visibleMessages.map((message: TutorMessage) => <p key={message.id} className={`rounded-2xl p-3 text-sm leading-relaxed ${message.role === "user" ? "ml-6 bg-[#1f493e] text-white" : "mr-3 bg-white text-slate-700"}`}>{message.content}</p>) : <p className="rounded-2xl bg-white p-3 text-sm leading-relaxed text-slate-600">Hi! I’m here while you learn {context.subject}. Ask me to explain, simplify, give an example, or check your understanding.</p>}</div>{error ? <p className="mt-3 rounded-xl bg-red-50 p-2 text-xs text-red-700">{error}</p> : null}<div className="mt-3 flex gap-2"><Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submit(); } }} placeholder={online ? "Ask your teacher..." : "Offline teacher needs a download"} disabled={!online || status === "thinking"} aria-label="Ask your AI Teacher" /><Button size="icon" onClick={() => void submit()} disabled={!draft.trim() || !online || status === "thinking"} aria-label="Send question"><Send className="size-4" /></Button></div><div className="mt-3 flex items-center justify-between"><Button variant={speech.listening ? "default" : "outline"} size="sm" onClick={() => speech.listening ? speech.stop() : void speech.start()} disabled={!speech.supported} className="gap-2">{speech.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}{speech.listening ? "Stop listening" : "Talk to teacher"}</Button>{latestAssistant ? <Button variant="ghost" size="sm" onClick={() => void speak(latestAssistant.content)} disabled={speaking} className="gap-2"><Volume2 className="size-4" /> Repeat</Button> : null}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600" onClick={() => void submit("Please explain this more simply.")}><Lightbulb className="size-3" /> Simplify</button><button type="button" className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600" onClick={() => void submit("Give me a relatable example and then ask me a check question.")}>Example + check</button></div></div> : null}</aside>;
}
