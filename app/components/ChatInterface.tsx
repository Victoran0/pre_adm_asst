import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, StopCircle } from "lucide-react";

/**
 * NHS Pre-Admission intake chat (patient-facing UI).
 *
 * Vercel AI SDK v5:
 *  - endpoint via transport: new DefaultChatTransport({ api })
 *  - manage input yourself; send with sendMessage({ text })
 *  - message text lives in m.parts (filter type === "text"), not m.content
 *
 * Plain React (Vite). Theming is self-contained in the <style> block below
 * using NHS Design System hex values, so it does NOT depend on tailwind.config.
 * Set VITE_API_BASE in your .env (e.g. https://<apim>.azure-api.net).
 */

const STAGE_LABELS = [
  "Step 1 of 3: Collecting your details",
  "Step 2 of 3: Finding the right department",
  "Step 3 of 3: Confirming your department",
] as const;

export default function ChatInterface({ sessionToken }: { sessionToken?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const { messages, status, stop, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: `${import.meta.env.VITE_API_BASE}/api/chat`,
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : undefined,
    }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const assistantTurns = messages.filter((m) => m.role === "assistant").length;
  const stageIndex = assistantTurns >= 4 ? 2 : assistantTurns >= 1 ? 1 : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <div className="nhs-chat">
      <style>{NHS_CSS}</style>

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

          <div className="nhs-chat__stage">
            <strong>{STAGE_LABELS[stageIndex]}</strong>
          </div>

          <div className="nhs-chat__messages">
            <Bubble role="assistant">
              Hello, and welcome. I'll help get you ready for your appointment.
              This takes about two minutes. To start, what is your patient
              reference? It looks like PT-0042.
            </Bubble>

            {messages.map((m) => {
              const text = (m as any).parts
                ? (m as any).parts
                    .filter((p: any) => p.type === "text")
                    .map((p: any) => p.text)
                    .join("")
                : (m as any).content;
              return (
                <Bubble key={m.id} role={m.role}>
                  {text}
                </Bubble>
              );
            })}

            {isLoading && messages.at(-1)?.role === "user" && <Typing />}
            <div ref={scrollRef} />
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
            placeholder="Type your answer..."
            autoComplete="off"
            className="nhs-chat__input"
          />
          {isLoading ? (
            <button type="button" onClick={stop} className="nhs-btn nhs-btn--secondary">
              <StopCircle size={18} /> Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="nhs-btn">
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

function Typing() {
  return (
    <div className="nhs-msg nhs-msg--assistant nhs-typing">
      <span /> <span /> <span />
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
