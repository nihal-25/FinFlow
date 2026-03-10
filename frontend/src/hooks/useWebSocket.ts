import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../stores/auth.store.ts";
import type { Transaction } from "../types";

interface TransactionEvent {
  transaction: Transaction;
  timestamp: string;
  reason?: string;
}

interface UseWebSocketOptions {
  onTransactionCompleted?: (event: TransactionEvent) => void;
  onTransactionFailed?: (event: TransactionEvent) => void;
}

export function useWebSocket(options: UseWebSocketOptions): void {
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!token) return;

    // In dev: Vite proxy handles /socket.io → analytics service.
    // In production: VITE_WS_URL points directly to the analytics service.
    const wsUrl = (import.meta.env["VITE_WS_URL"] as string | undefined) ?? "/";
    const socket = io(wsUrl, {
      auth: { token },
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("transaction:completed", (event: TransactionEvent) => {
      options.onTransactionCompleted?.(event);
    });

    socket.on("transaction:failed", (event: TransactionEvent) => {
      options.onTransactionFailed?.(event);
    });

    socket.on("connect_error", (err) => {
      console.error("[ws] Connection error:", err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);
}
