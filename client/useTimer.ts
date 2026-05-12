import { useEffect, useRef, useState } from "react";

export function useTimer(endsAt: number | undefined, onLowTimer?: () => void) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const tickedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    tickedRef.current = new Set();
  }, [endsAt]);

  useEffect(() => {
    if (!endsAt) return;

    const update = () => {
      const secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(secs);
      if (onLowTimer && secs > 0 && secs <= 10 && !tickedRef.current.has(secs)) {
        tickedRef.current.add(secs);
        onLowTimer();
      }
    };
    update();

    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt, onLowTimer]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return { secondsLeft, display };
}
