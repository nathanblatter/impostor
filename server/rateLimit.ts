// Per-connection sliding window: max N messages per window
export class MessageRateLimiter {
  private count = 0;
  private windowStart = Date.now();

  constructor(
    private readonly maxMessages: number = 25,
    private readonly windowMs: number = 10_000
  ) {}

  // Returns true if the message is allowed
  check(): boolean {
    const now = Date.now();
    if (now - this.windowStart > this.windowMs) {
      this.count = 0;
      this.windowStart = now;
    }
    this.count++;
    return this.count <= this.maxMessages;
  }

  // 3x over limit = abusive, disconnect
  isAbusive(): boolean {
    return this.count > this.maxMessages * 3;
  }
}

// Per-connection throttle for expensive AI calls
export class AiThrottle {
  private lastCall = 0;

  constructor(private readonly minIntervalMs: number = 10_000) {}

  isAllowed(): boolean {
    const now = Date.now();
    if (now - this.lastCall >= this.minIntervalMs) {
      this.lastCall = now;
      return true;
    }
    return false;
  }

  cooldownSeconds(): number {
    return Math.ceil((this.minIntervalMs - (Date.now() - this.lastCall)) / 1000);
  }
}

// Per-IP rate limiter for room creation and joins
const ipWindows = new Map<string, { count: number; windowStart: number }>();

export function checkIpLimit(ip: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const entry = ipWindows.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    ipWindows.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= maxPerMinute;
}

// Clean up stale IP entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [ip, entry] of ipWindows) {
    if (entry.windowStart < cutoff) ipWindows.delete(ip);
  }
}, 5 * 60_000).unref();

// Input sanitization helpers
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(CONTROL_CHARS, "").trim();
  if (s.length === 0 || s.length > 20) return null;
  return s;
}

export function sanitizeText(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(CONTROL_CHARS, "").trim();
  if (s.length === 0 || s.length > maxLen) return null;
  return s;
}

export function sanitizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(s)) return null;
  return s;
}
