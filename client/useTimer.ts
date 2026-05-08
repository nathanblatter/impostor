import { useEffect, useState } from "react";

export function useTimer(endsAt: number | undefined) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!endsAt) return;

    const update = () => {
      setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    };
    update();

    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return { secondsLeft, display };
}
