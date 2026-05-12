let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
}

export function playTick() {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.frequency.value = 880;
  osc.type = "sine";
  gain.gain.setValueAtTime(0.18, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 0.08);
}

export function playRoleReveal() {
  const ac = getCtx();
  if (!ac) return;
  const notes = [330, 415, 523, 659];
  notes.forEach((freq, i) => {
    const osc = ac!.createOscillator();
    const gain = ac!.createGain();
    osc.connect(gain);
    gain.connect(ac!.destination);
    osc.frequency.value = freq;
    osc.type = "triangle";
    const t = ac!.currentTime + i * 0.11;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}
