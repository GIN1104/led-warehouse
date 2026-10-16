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
import {
  browserOtpStorage,
  clearPendingOtp,
  issueLocalOtp,
  OTP_TTL_MS,
  readPendingOtp,
  verifyLocalOtp,
  writePendingOtp,
} from "@/lib/email-auth/otp";
import {
  browserAuthStorage,
  clearEmailAuthSession,
  readEmailAuthSession,
  writeEmailAuthSession,
} from "@/lib/email-auth/session";
import type { EmailAuthSession, OtpIssueResult, OtpVerifyResult } from "@/lib/email-auth/types";
import { findUserByEmail, listDirectoryEmails } from "@/lib/services/queries";

function isLoginPath(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return path === "/login" || path.endsWith("/login");
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}

export type EmailAuthApi = {
  session: EmailAuthSession | null;
  ready: boolean;
  requestCode: (email: string) => Promise<OtpIssueResult>;
  verifyCode: (email: string, code: string) => Promise<OtpVerifyResult>;
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
  setSession: (session: EmailAuthSession) => void,
): void {
  const user = findUserByEmail(db, email);
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
  const { db, switchUser, revision } = useWarehouse();
  const pathname = usePathname();
  const router = useRouter();
  const login = isLoginPath(pathname);
  const [session, setSession] = useState<EmailAuthSession | null>(null);
  const [ready, setReady] = useState(false);
  void revision;

  useEffect(() => {
    setSession(readEmailAuthSession(browserAuthStorage()));
    setReady(true);
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

  const requestCode = useCallback(
    async (email: string): Promise<OtpIssueResult> => {
      const directoryEmails = listDirectoryEmails(db);

      try {
        const response = await fetch(`${apiBase()}/api/v1/auth/otp/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (response.ok) {
          const data = (await response.json()) as {
            ok?: boolean;
            mode?: "mock" | "sent";
            code?: string;
            email?: string;
            expiresAt?: number;
            reason?: string;
          };
          if (data.ok && data.mode === "sent") {
            writePendingOtp(browserOtpStorage(), {
              email: normalizeEmail(email),
              code: "__server__",
              expiresAt: data.expiresAt ?? Date.now() + OTP_TTL_MS,
              attempts: 0,
            });
            return {
              ok: true,
              mode: "sent",
              email: normalizeEmail(data.email ?? email),
              expiresAt: data.expiresAt ?? Date.now() + OTP_TTL_MS,
            };
          }
          if (data.ok && data.mode === "mock" && data.code) {
            writePendingOtp(browserOtpStorage(), {
              email: normalizeEmail(email),
              code: data.code,
              expiresAt: data.expiresAt ?? Date.now() + OTP_TTL_MS,
              attempts: 0,
            });
            return {
              ok: true,
              mode: "mock",
              code: data.code,
              email: normalizeEmail(data.email ?? email),
              expiresAt: data.expiresAt ?? Date.now() + OTP_TTL_MS,
            };
          }
        }
      } catch {
        // Pages / offline: локальный mock.
      }

      return issueLocalOtp({ email, directoryEmails, storage: browserOtpStorage() });
    },
    [db],
  );

  const verifyCode = useCallback(
    async (email: string, code: string): Promise<OtpVerifyResult> => {
      const pending = readPendingOtp(browserOtpStorage());
      if (pending?.code === "__server__") {
        try {
          const response = await fetch(`${apiBase()}/api/v1/auth/otp/`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, code }),
          });
          const data = (await response.json()) as OtpVerifyResult;
          if (data.ok) finishLogin(db, switchUser, data.email, setSession);
          return data;
        } catch {
          return { ok: false, reason: "no_pending" };
        }
      }

      const result = verifyLocalOtp({ email, code, storage: browserOtpStorage() });
      if (result.ok) finishLogin(db, switchUser, result.email, setSession);
      return result;
    },
    [db, switchUser],
  );

  const logout = useCallback(() => {
    clearEmailAuthSession(browserAuthStorage());
    setSession(null);
    router.replace("/login/");
  }, [router]);

  const api = useMemo<EmailAuthApi>(
    () => ({ session, ready, requestCode, verifyCode, logout }),
    [session, ready, requestCode, verifyCode, logout],
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
