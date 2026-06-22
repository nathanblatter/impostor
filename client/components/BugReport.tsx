import { useEffect, useRef, useState } from "react";

const SEVERITIES = [
  { value: "low", label: "Minor — cosmetic" },
  { value: "med", label: "Medium — annoying" },
  { value: "high", label: "High — hard to play" },
  { value: "urgent", label: "Urgent — game-breaking" },
];

type Status = "idle" | "sending" | "sent" | "error";

export default function BugReport() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("med");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => ref.current?.focus(), 40);
    return () => { document.removeEventListener("keydown", onKey); window.clearTimeout(id); };
  }, [open]);

  function close() {
    setOpen(false);
    window.setTimeout(() => { setMessage(""); setSeverity("med"); setStatus("idle"); setError(""); }, 200);
  }

  async function send() {
    const trimmed = message.trim();
    if (!trimmed) { setError("Add a quick description first."); ref.current?.focus(); return; }
    setStatus("sending"); setError("");
    try {
      const res = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          severity,
          url: window.location.href,
          meta: { path: window.location.pathname, viewport: `${window.innerWidth}x${window.innerHeight}`, userAgent: navigator.userAgent },
        }),
      });
      if (!res.ok) throw new Error();
      setStatus("sent");
      window.setTimeout(close, 1300);
    } catch {
      setStatus("error"); setError("Could not send. Try again.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a bug"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-3
                   text-xs font-extrabold uppercase tracking-wider text-gray-900 shadow-lg shadow-amber-500/30
                   transition active:scale-95 hover:bg-amber-300"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        🐞 Bug
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <div role="dialog" aria-modal="true" aria-label="Report a bug"
               className="w-full max-w-sm rounded-2xl border-2 border-amber-400 bg-white p-5 shadow-2xl">
            <h2 className="text-base font-extrabold uppercase tracking-wide text-gray-900">Hit a bug?</h2>
            <p className="mt-0.5 text-xs text-gray-500">Tell us what broke — it goes straight to the board.</p>

            {status === "sent" ? (
              <div className="mt-5 rounded-xl bg-amber-50 px-4 py-6 text-center text-sm font-bold text-amber-700">
                🎉 Report filed. Thanks!
              </div>
            ) : (
              <>
                <textarea
                  ref={ref} value={message} onChange={(e) => setMessage(e.target.value)}
                  rows={4} maxLength={5000} placeholder="What you saw, and what you expected…"
                  className="mt-4 w-full resize-y rounded-xl border-2 border-gray-200 bg-gray-50 p-3 text-sm text-gray-900
                             placeholder-gray-400 focus:border-amber-400 focus:outline-none"
                />
                <select
                  value={severity} onChange={(e) => setSeverity(e.target.value)}
                  className="mt-3 w-full rounded-xl border-2 border-gray-200 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-amber-400 focus:outline-none"
                >
                  {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>

                <div className="mt-4 flex items-center gap-3">
                  <span className="mr-auto text-xs font-semibold text-red-500">{error}</span>
                  <button type="button" onClick={close} className="text-xs font-extrabold uppercase tracking-wider text-gray-400 hover:text-gray-700">Cancel</button>
                  <button type="button" onClick={send} disabled={status === "sending"}
                    className="rounded-full bg-amber-400 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-gray-900 hover:bg-amber-300 disabled:opacity-60">
                    {status === "sending" ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
