"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// In-app polling only (thesis 3.x): the ledger refreshes on the 30-60s
// interval, no websockets or push. router.refresh() re-runs the server
// component, which re-reads the database and recomputes levels.
export function PollRefresher({ seconds = 45 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return null;
}