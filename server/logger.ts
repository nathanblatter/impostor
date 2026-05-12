function ts() {
  return new Date().toISOString();
}

function prefix(roomCode?: string | null, mode?: string | null) {
  const parts = [roomCode, mode].filter(Boolean);
  return parts.length ? ` [${parts.join("/")}]` : "";
}

export const logger = {
  info(msg: string, roomCode?: string | null, mode?: string | null) {
    console.log(`${ts()}${prefix(roomCode, mode)} ${msg}`);
  },
  warn(msg: string, roomCode?: string | null, mode?: string | null) {
    console.warn(`${ts()}${prefix(roomCode, mode)} WARN: ${msg}`);
  },
  error(msg: string, err?: unknown, roomCode?: string | null, mode?: string | null) {
    console.error(`${ts()}${prefix(roomCode, mode)} ERROR: ${msg}`, err ?? "");
  },
};
