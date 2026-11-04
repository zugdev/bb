import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";

interface ThreadRowNavigation {
  openInSplit(threadId: string): void;
  openInTab(threadId: string): void;
}

const ThreadRowNavigationContext = createContext<ThreadRowNavigation | null>(
  null,
);

export function ThreadRowNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const navigate = useBbNavigate();
  const latest = useRef(navigate);
  useLayoutEffect(() => {
    latest.current = navigate;
  });
  const value = useMemo<ThreadRowNavigation>(
    () => ({
      openInSplit: (threadId) =>
        latest.current.toThread(threadId, { split: true }),
      openInTab: (threadId) =>
        latest.current.toThread(threadId, { experimental_tab: true }),
    }),
    [],
  );
  return (
    <ThreadRowNavigationContext.Provider value={value}>
      {children}
    </ThreadRowNavigationContext.Provider>
  );
}

export function useThreadRowNavigation(): ThreadRowNavigation {
  const value = useContext(ThreadRowNavigationContext);
  if (value === null) {
    throw new Error(
      "useThreadRowNavigation must be used within a <ThreadRowNavigationProvider>",
    );
  }
  return value;
}
