import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send, StopCircle } from "lucide-react";

/**
 * NHS Pre-Admission intake chat (patient-facing UI), wired to the FastAPI backend.
 *
 * Flow:
 *  1. On load: POST /api/session/start with this chat's id -> GPT-4o greeting (HLD §5.1 step 1).
 *  2. Each message: POST /api/chat, streamed back in the Vercel AI SDK v5 UI message stream format.
 *     - text parts: the assistant's replies, appearing as each agent finishes
 *     - data-status (transient): "Finding the right department..." while agents work
 *     - data-phase (transient): drives the step indicator and the Yes/No buttons
 *
 * Set VITE_API_BASE in .env (http://localhost:8000 locally, https://<apim>.azure-api.net in Azure).
 */

const API_BASE = import.meta.env.VITE_API_BASE;

type Phase = "intake" | "routing" | "awaiting_confirmation" | "completed" | "escalated";

const STAGE_LABELS: Record<Phase, string> = {
  intake: "Step 1 of 3: Collecting your details",
  routing: "Step 2 of 3: Finding the right department",
  awaiting_confirmation: "Step 3 of 3: Confirming your department",
  completed: "Complete: your details have been sent",
  escalated: "A receptionist will contact you",
};

export default function ChatInterface({ sessionToken }: { sessionToken?: string }) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);
  const started = useRef(false);
  const [chatId] = useState(() => crypto.randomUUID()); // also the backend session id
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("intake");
  const [statusText, setStatusText] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (sessionToken) h.Authorization = `Bearer ${sessionToken}`;
    return h;
  }, [sessionToken]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE}/api/chat`,
        headers: authHeaders,
        // The backend keeps the conversation state, so only the newest message is sent.
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: { id, message: messages[messages.length - 1] },
        }),
      }),
    [authHeaders],
  );

  const { messages, setMessages, status, stop, sendMessage, error } = useChat({
    id: chatId,
    transport,
    onData: (part) => {
      if (part.type === "data-status") setStatusText((part.data as { text: string }).text);
      if (part.type === "data-phase") setPhase((part.data as { phase: Phase }).phase);
    },
    onFinish: () => setStatusText(null),
    onError: () => setStatusText(null),
  });

  // Step 1: create the backend session and show the GPT-4o greeting.
  useEffect(() => {
    if (started.current) return; // React StrictMode runs effects twice in development
    started.current = true;
    fetch(`${API_BASE}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ session_id: chatId }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { reply: string; phase: Phase }) => {
        setPhase(data.phase);
        setMessages([
          { id: "greeting", role: "assistant", parts: [{ type: "text", text: data.reply }] } as UIMessage,
        ]);
      })
      .catch(() => setStartError("Sorry, the assistant is unavailable right now. Please try again later."));
  }, [chatId, authHeaders, setMessages]);

  const isLoading = status === "submitted" || status === "streaming";
  const greetingLoaded = messages.length > 0;
  const sessionClosed = phase === "completed" || phase === "escalated";
  const canType = greetingLoaded && !sessionClosed && !startError;

  // Keep the newest content fully in view: scroll to the very bottom whenever the message area changes size
  // (message sent, reply streaming in, typing indicator, Yes/No buttons, errors).
  streamingRef.current = status === "streaming";

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const scrollToBottom = () =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: streamingRef.current ? "auto" : "smooth", // instant while words stream in, smooth otherwise
      });
    const observer = new ResizeObserver(scrollToBottom);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function send(text: string) {
    if (!text.trim() || isLoading || !canType) return;
    sendMessage({ text });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
    setInput("");
  }

  return (
    <div className="nhs-chat">
      <style>{NHS_CSS + NHS_CSS_EXTRA}</style>

      <header className="nhs-chat__header">
        <div className="nhs-chat__header-inner">
          <div className="nhs-chat__brand">
            <span className="nhs-chat__logo">NHS</span>
            <div>
              <div className="nhs-chat__title">Pre-Admission Assistant</div>
              <div className="nhs-chat__sub">Elective surgery intake</div>
            </div>
          </div>
          <span className="nhs-chat__tag">Not for emergencies</span>
        </div>
      </header>

      <main className="nhs-chat__main">
        <div className="nhs-chat__col">
          <p className="nhs-chat__privacy">
            Demonstration using synthetic data. Do not enter a real name or NHS
            number. Use a patient reference such as PT-0042.
          </p>

          <div className="nhs-chat__stage" aria-live="polite">
            <strong>{STAGE_LABELS[phase]}</strong>
          </div>

          <div className="nhs-chat__messages" aria-live="polite" ref={messagesRef}>
            {!greetingLoaded && !startError && <Typing label="Starting your session..." />}
            {startError && <div className="nhs-chat__error">{startError}</div>}

            {messages.map((m) => {
              const text = m.parts
                .filter((p) => p.type === "text")
                .map((p) => (p as { text: string }).text)
                .join("\n\n");
              return text ? (
                <Bubble key={m.id} role={m.role}>
                  {text}
                </Bubble>
              ) : null;
            })}

            {isLoading && <Typing label={statusText} />}

            {phase === "awaiting_confirmation" && !isLoading && (
              <div className="nhs-chat__quick">
                <button type="button" className="nhs-btn" onClick={() => send("Yes")}>
                  Yes, that's right
                </button>
                <button type="button" className="nhs-btn nhs-btn--secondary" onClick={() => send("No")}>
                  No
                </button>
              </div>
            )}

            {error && (
              <div className="nhs-chat__error">
                Something went wrong sending your message. Please try again.
              </div>
            )}
          </div>
        </div>
      </main>

      <div className="nhs-chat__composer-wrap">
        <form onSubmit={submit} className="nhs-chat__composer">
          <label htmlFor="chat-input" className="nhs-chat__sr">
            Your message
          </label>
          <input
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={sessionClosed ? "This session has ended" : "Type your answer..."}
            autoComplete="off"
            className="nhs-chat__input"
            disabled={!canType}
          />
          {isLoading ? (
            <button type="button" onClick={stop} className="nhs-btn nhs-btn--secondary">
              <StopCircle size={18} /> Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.trim() || !canType} className="nhs-btn">
              <Send size={18} /> Send
            </button>
          )}
        </form>
        <p className="nhs-chat__hint">
          This assistant can make mistakes. It does not provide medical advice.
        </p>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: string; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`nhs-msg ${isUser ? "nhs-msg--user" : "nhs-msg--assistant"}`}>
      <span className="nhs-msg__who">{isUser ? "You" : "Assistant"}</span>
      {children}
    </div>
  );
}

function Typing({ label }: { label?: string | null }) {
  return (
    <div className="nhs-msg nhs-msg--assistant nhs-typing">
      <span className="nhs-typing__dot" /> <span className="nhs-typing__dot" /> <span className="nhs-typing__dot" />
      {label && <em className="nhs-typing__label">{label}</em>}
    </div>
  );
}

const NHS_CSS = `
.nhs-chat {
  --nhs-blue:#005EB8; --nhs-dark-grey:#425563; --nhs-mid-grey:#768692;
  --nhs-pale-grey:#E8EDEE; --nhs-black:#212B32; --nhs-green:#007F3B;
  --nhs-green-dark:#00401E; --nhs-red:#D5281B; --nhs-yellow:#FFEB3B;
  display:flex; flex-direction:column; min-height:100vh;
  font-family: Arial, Helvetica, sans-serif; color:var(--nhs-black);
  background:var(--nhs-pale-grey);
}
.nhs-chat *, .nhs-chat *::before, .nhs-chat *::after { box-sizing:border-box; }
.nhs-chat__header { background:var(--nhs-blue); padding:12px 16px; }
.nhs-chat__header-inner { max-width:720px; margin:0 auto; display:flex;
  align-items:center; justify-content:space-between; gap:16px; }
.nhs-chat__brand { display:flex; align-items:center; gap:14px; }
.nhs-chat__logo { background:#fff; color:var(--nhs-blue); font-weight:700;
  font-size:22px; letter-spacing:.5px; padding:4px 8px; border-radius:2px; line-height:1; }
.nhs-chat__title { color:#fff; font-size:18px; font-weight:700; line-height:1.2; }
.nhs-chat__sub { color:#B8D4EE; font-size:13px; margin-top:2px; }
.nhs-chat__tag { color:#fff; font-size:12px; font-weight:500; border:1px solid rgba(255,255,255,.3);
  background:rgba(255,255,255,.1); padding:4px 12px; border-radius:999px; }
@media (max-width:520px){ .nhs-chat__tag{ display:none; } }

.nhs-chat__main { flex:1; display:flex; justify-content:center; padding:20px 16px 0; }
.nhs-chat__col { width:100%; max-width:720px; display:flex; flex-direction:column; }
.nhs-chat__privacy { margin:0 0 16px; font-size:12px; color:var(--nhs-dark-grey);
  background:#FFF7CC; border-left:4px solid var(--nhs-yellow); padding:8px 12px; }
.nhs-chat__stage { background:#fff; border-left:4px solid var(--nhs-blue);
  padding:10px 14px; margin-bottom:16px; font-size:14px; color:var(--nhs-dark-grey); }
.nhs-chat__stage strong { color:var(--nhs-black); }

.nhs-chat__messages { display:flex; flex-direction:column; gap:14px; padding-bottom:20px; }
.nhs-msg { max-width:82%; padding:12px 16px; font-size:16px; line-height:1.5;
  border-radius:4px; white-space:pre-wrap; }
.nhs-msg--assistant { align-self:flex-start; background:#fff; border:1px solid #D8DDE0; }
.nhs-msg--user { align-self:flex-end; background:var(--nhs-blue); color:#fff; }
.nhs-msg__who { display:block; font-size:12px; font-weight:700; text-transform:uppercase;
  letter-spacing:.4px; margin-bottom:4px; opacity:.75; }

.nhs-typing { display:flex; gap:5px; align-items:center; }
.nhs-typing span { width:8px; height:8px; border-radius:50%; background:var(--nhs-mid-grey);
  animation:nhsBounce 1.2s infinite ease-in-out; }
.nhs-typing span:nth-child(2){ animation-delay:.15s; }
.nhs-typing span:nth-child(3){ animation-delay:.3s; }
@keyframes nhsBounce { 0%,60%,100%{ transform:translateY(0); opacity:.5; }
  30%{ transform:translateY(-5px); opacity:1; } }

.nhs-chat__composer-wrap { position:sticky; bottom:0; background:var(--nhs-pale-grey);
  border-top:1px solid #C8CFD3; padding:14px 16px; }
.nhs-chat__composer { max-width:720px; margin:0 auto; display:flex; gap:12px; align-items:center; }
.nhs-chat__input { flex:1; height:48px; font-family:inherit; font-size:16px; padding:0 14px;
  border:2px solid var(--nhs-black); border-radius:0; background:#fff; color:var(--nhs-black); }
.nhs-chat__input:focus { outline:3px solid var(--nhs-yellow); outline-offset:0;
  box-shadow:inset 0 0 0 2px var(--nhs-black); }
.nhs-chat__hint { max-width:720px; margin:8px auto 0; text-align:center;
  font-size:12px; color:var(--nhs-mid-grey); }
.nhs-chat__sr { position:absolute; width:1px; height:1px; padding:0; margin:-1px;
  overflow:hidden; clip:rect(0,0,0,0); border:0; }

.nhs-btn { display:inline-flex; align-items:center; gap:8px; font-family:inherit;
  font-size:16px; font-weight:700; color:#fff; background:var(--nhs-green);
  border:2px solid transparent; border-radius:4px; padding:0 18px; height:48px;
  cursor:pointer; box-shadow:0 4px 0 var(--nhs-green-dark); }
.nhs-btn:hover { background:#006B32; }
.nhs-btn:active { transform:translateY(2px); box-shadow:0 2px 0 var(--nhs-green-dark); }
.nhs-btn:focus { outline:3px solid var(--nhs-yellow); outline-offset:0; box-shadow:0 4px 0 var(--nhs-black); }
.nhs-btn:disabled { opacity:.5; cursor:not-allowed; box-shadow:none; }
.nhs-btn--secondary { background:#fff; color:var(--nhs-black); border:2px solid var(--nhs-black);
  box-shadow:0 4px 0 var(--nhs-mid-grey); }
.nhs-btn--secondary:hover { background:var(--nhs-pale-grey); }
`;


const NHS_CSS_EXTRA = `
.nhs-typing .nhs-typing__dot { width:8px; height:8px; border-radius:50%; background:var(--nhs-mid-grey);
  animation:nhsBounce 1.2s infinite ease-in-out; }
.nhs-typing .nhs-typing__dot:nth-child(2){ animation-delay:.15s; }
.nhs-typing .nhs-typing__dot:nth-child(3){ animation-delay:.3s; }
.nhs-typing__label { margin-left:8px; font-size:14px; color:var(--nhs-dark-grey); font-style:normal; }
.nhs-chat__quick { display:flex; gap:12px; align-self:flex-start; }
.nhs-chat__error { background:#fff; border-left:4px solid var(--nhs-red); padding:10px 14px;
  font-size:14px; color:var(--nhs-black); }
.nhs-chat__input:disabled { background:var(--nhs-pale-grey); cursor:not-allowed; }
`;
