import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type GameEvent = Record<string, any> & {
  type: string;
  sessionId?: string;
  userId?: string;
};

type UseGameChannelOpts = {
  sessionId: string;
  userId: string;
  onEvent?: (event: GameEvent) => void;
  afkTimeoutMs?: number;
  onAfkDetected?: () => void;
};

export function useGameChannel({
  sessionId,
  userId,
  onEvent,
  afkTimeoutMs = 15000,
  onAfkDetected,
}: UseGameChannelOpts) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastActionRef = useRef<number>(Date.now());
  const afkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [connected, setConnected] = useState(false);

  const send = useCallback(
    (type: string, payload: Record<string, any> = {}) => {
      lastActionRef.current = Date.now();
      channelRef.current?.send({
        type: "broadcast",
        event: "game",
        payload: { type, sessionId, userId, ...payload },
      });
    },
    [sessionId, userId]
  );

  const recordAction = useCallback(() => {
    lastActionRef.current = Date.now();
  }, []);

  useEffect(() => {
    const ch = supabase.channel(`game:${sessionId}`, {
      config: { broadcast: { self: true } },
    });

    ch.on("broadcast", { event: "game" }, (msg: any) => {
      const event: GameEvent = msg.payload;
      if (event.sessionId === sessionId) {
        onEvent?.(event);
      }
    });

    ch.subscribe((status: string) => {
      setConnected(status === "SUBSCRIBED");
    });

    channelRef.current = ch;

    // AFK detector
    if (onAfkDetected) {
      afkTimerRef.current = setInterval(() => {
        if (Date.now() - lastActionRef.current > afkTimeoutMs) {
          onAfkDetected();
        }
      }, 2000);
    }

    return () => {
      supabase.removeChannel(ch);
      if (afkTimerRef.current) clearInterval(afkTimerRef.current);
    };
  }, [sessionId, onEvent, afkTimeoutMs, onAfkDetected]);

  return { send, recordAction, connected };
}
