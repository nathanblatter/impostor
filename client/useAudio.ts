let audioCtx: AudioContext | null = null;
let queue: string[] = [];
let isPlaying = false;
let unlocked = false;

function playNext() {
  if (queue.length === 0) {
    isPlaying = false;
    return;
  }
  isPlaying = true;
  const base64 = queue.shift()!;

  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    audioCtx.decodeAudioData(bytes.buffer, (buffer) => {
      const source = audioCtx!.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx!.destination);
      source.onended = playNext;
      source.start(0);
    }, (err) => {
      console.error("Audio decode failed:", err);
      playNext();
    });
  } catch (err) {
    console.error("Audio playback failed:", err);
    playNext();
  }
}

export function unlockAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  unlocked = true;
  if (!isPlaying && queue.length > 0) playNext();
}

export function enqueueAudio(audioBase64: string) {
  queue.push(audioBase64);
  if (unlocked && !isPlaying) playNext();
}

export function isAudioUnlocked() {
  return unlocked;
}
