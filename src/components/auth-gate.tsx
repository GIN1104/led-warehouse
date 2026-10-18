"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { useWarehouse } from "@/components/warehouse";
import { normalizeEmail } from "@/lib/email-auth/normalize";
import { browserOtpStorage, clearPendingOtp } from "@/lib/email-auth/otp";
import {
  browserAuthStorage,
  clearEmailAuthSession,
  readEmailAuthSession,
  writeEmailAuthSession,
} from "@/lib/email-auth/session";
import type { EmailAuthSession } from "@/lib/email-auth/types";
import {
  requestAccessOrLogin,
  type AccessLoginOutcome,
} from "@/lib/services/access-requests";
import { findUserByEmail } from "@/lib/services/queries";

function isLoginPath(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return path === "/login" || path.endsWith("/login");
}

export type EmailAuthApi = {
  session: EmailAuthSession | null;
  ready: boolean;
  requestAccess: (email: string) => Promise<AccessLoginOutcome>;
  logout: () => void;
};

const EmailAuthContext = createContext<EmailAuthApi | null>(null);

export function useEmailAuth(): EmailAuthApi {
  const value = useContext(EmailAuthContext);
  if (!value) throw new Error("EmailAuth вне AuthGate");
  return value;
}

function finishLogin(
  db: ReturnType<typeof useWarehouse>["db"],
  switchUser: (userId: string) => void,
  email: string,
  userId: string | null,
  setSession: (session: EmailAuthSession) => void,
): void {
  const user = userId ? { id: userId } : findUserByEmail(db, email);
  const next: EmailAuthSession = {
    email: normalizeEmail(email),
    userId: user?.id ?? null,
    loggedInAt: Date.now(),
  };
  writeEmailAuthSession(browserAuthStorage(), next);
  setSession(next);
  if (user) switchUser(user.id);
  clearPendingOtp(browserOtpStorage());
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { db, switchUser, refresh, revision } = useWarehouse();
  const pathname = usePathname();
  const router = useRouter();
  const login = isLoginPath(pathname);
  const [session, setSession] = useState<EmailAuthSession | null>(null);
  const [ready, setReady] = useState(false);
  void revision;

  useEffect(() => {
    let cancel = false;
    void (async () => {
      await Promise.resolve();
      if (cancel) return;
      setSession(readEmailAuthSession(browserAuthStorage()));
      setReady(true);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session && !login) {
      const next = `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
      router.replace(`/login/?next=${encodeURIComponent(next || "/")}`);
    } else if (session && login) {
      router.replace("/");
    }
  }, [ready, session, login, pathname, router]);

  const requestAccess = useCallback(
    async (email: string): Promise<AccessLoginOutcome> => {
      const outcome = requestAccessOrLogin(db, email);
      if (outcome.kind === "logged_in") {
        finishLogin(db, switchUser, outcome.email, outcome.userId, setSession);
        await refresh();
      } else if (outcome.kind === "pending") {
        await refresh();
      }
      return outcome;
    },
    [db, refresh, switchUser],
  );

  const logout = useCallback(() => {
    clearEmailAuthSession(browserAuthStorage());
    setSession(null);
    router.replace("/login/");
  }, [router]);

  const api = useMemo<EmailAuthApi>(
    () => ({ session, ready, requestAccess, logout }),
    [session, ready, requestAccess, logout],
  );

  if (!ready || (!session && !login)) {
    return <p className="p-8 text-sm">…</p>;
  }

  return (
    <EmailAuthContext.Provider value={api}>
      {login ? children : <Shell>{children}</Shell>}
    </EmailAuthContext.Provider>
  );
}
