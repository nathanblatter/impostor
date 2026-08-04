import { useEffect, useRef, useState } from "react";

const SEVERITIES = [
  { value: "low", label: "Minor — cosmetic" },
  { value: "med", label: "Medium — annoying" },
  { value: "high", label: "High — hard to play" },
  { value: "urgent", label: "Urgent — game-breaking" },
];

const MAX_SHOTS = 4;
const MAX_SHOT_BYTES = 8 * 1024 * 1024; // 8MB
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

type Status = "idle" | "sending" | "sent" | "error";

type Shot = { id: string; file: File; url: string };

let shotSeq = 0;

export default function BugReport() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("med");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [shotError, setShotError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [sentNote, setSentNote] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => ref.current?.focus(), 40);
    return () => { document.removeEventListener("keydown", onKey); window.clearTimeout(id); };
  }, [open]);

  // Revoke any leftover object URLs on unmount.
  useEffect(() => () => { shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)); }, []);

  function clearShots() {
    shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
  }

  function close() {
    setOpen(false);
    window.setTimeout(() => {
      setMessage(""); setSeverity("med"); setStatus("idle"); setError("");
      setShotError(""); setDragging(false); setSentNote(""); clearShots();
    }, 200);
  }

  function addFiles(list: Iterable<File>) {
    setShotError("");
    const problems: string[] = [];
    setShots((prev) => {
      const next = [...prev];
      for (const file of list) {
        if (!IMAGE_TYPES.includes(file.type)) {
          problems.push(`${file.name || "That file"} isn't an image (PNG, JPEG, WebP, or GIF).`);
          continue;
        }
        if (file.size > MAX_SHOT_BYTES) {
          problems.push(`${file.name || "One screenshot"} is over 8MB.`);
          continue;
        }
        if (next.length >= MAX_SHOTS) {
          problems.push(`Up to ${MAX_SHOTS} screenshots per report.`);
          break;
        }
        next.push({ id: `shot-${++shotSeq}`, file, url: URL.createObjectURL(file) });
      }
      return next;
    });
    if (problems.length) setShotError(problems[0]);
  }

  function removeShot(id: string) {
    setShotError("");
    setShots((prev) => {
      const gone = prev.find((s) => s.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((s) => s.id !== id);
    });
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData?.items || [])
      .filter((it) => it.kind === "file")
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length) { e.preventDefault(); addFiles(files); }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  }

  async function uploadShots(itemId: string): Promise<boolean> {
    const current = shotsRef.current;
    if (!current.length) return true;
    try {
      const form = new FormData();
      current.forEach((s) => form.append("files", s.file, s.file.name || "screenshot.png"));
      const res = await fetch(`/api/bug-report/${encodeURIComponent(itemId)}/screenshots`, {
        method: "POST",
        body: form,
      });
      return res.ok;
    } catch {
      return false;
    }
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
      const data: { id?: string | null } = await res.json().catch(() => ({}));
      // The report is filed — screenshots are best-effort from here.
      let note = "";
      if (shotsRef.current.length) {
        const ok = data.id ? await uploadShots(data.id) : false;
        if (!ok) note = "Screenshots didn't upload, but your report went through.";
      }
      setSentNote(note);
      setStatus("sent");
      window.setTimeout(close, note ? 2600 : 1300);
    } catch {
      setStatus("error"); setError("Could not send. Try again.");
    }
  }

  const atCap = shots.length >= MAX_SHOTS;

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
               onPaste={onPaste}
               className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-2xl border-2 border-amber-400 bg-white p-5 shadow-2xl">
            <h2 className="text-base font-extrabold uppercase tracking-wide text-gray-900">Hit a bug?</h2>
            <p className="mt-0.5 text-xs text-gray-500">Tell us what broke — it goes straight to the board.</p>

            {status === "sent" ? (
              <div className="mt-5 rounded-xl bg-amber-50 px-4 py-6 text-center text-sm font-bold text-amber-700">
                🎉 Report filed. Thanks!
                {sentNote && <div className="mt-2 text-xs font-semibold text-amber-600">{sentNote}</div>}
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

                <input
                  ref={fileRef} type="file" multiple accept={IMAGE_TYPES.join(",")}
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={atCap}
                  onDragOver={(e) => { e.preventDefault(); if (!atCap) setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`mt-3 flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed
                              p-3 text-xs font-bold text-gray-500 transition active:scale-[0.99]
                              ${dragging ? "border-amber-400 bg-amber-50 text-amber-700" : "border-gray-200 bg-gray-50"}
                              ${atCap ? "opacity-50" : "hover:border-amber-300"}`}
                >
                  📸 {atCap
                    ? `${MAX_SHOTS} screenshots max`
                    : `Add screenshots (${shots.length}/${MAX_SHOTS}) — tap, drop, or paste`}
                </button>
                {shotError && <p className="mt-1.5 text-xs font-semibold text-red-500">{shotError}</p>}

                {shots.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {shots.map((s) => (
                      <div key={s.id} className="relative aspect-square overflow-hidden rounded-lg border-2 border-gray-200">
                        <img src={s.url} alt={s.file.name || "Screenshot"} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeShot(s.id)}
                          aria-label={`Remove ${s.file.name || "screenshot"}`}
                          className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full
                                     bg-black/60 text-xs font-extrabold text-white active:scale-90"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

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
