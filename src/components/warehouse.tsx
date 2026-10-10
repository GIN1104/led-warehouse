"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n";
import { sharedLedger } from "@/lib/api";
import { openBrowserDb, persistBrowserDb } from "@/lib/db/browser";
import type { Sql } from "@/lib/db/sql";
import { knownRevision, openSharedDb, pushSharedDb, remoteRevision } from "@/lib/db/shared-client";
import { listUsers, type UserRow } from "@/lib/services/queries";

const USER_KEY = "lw_user";

type ReadyWarehouse = {
  ready: true;
  db: Sql;
  users: UserRow[];
  session: UserRow;
  revision: number;
  shared: boolean;
  notice: string | null;
  refresh: () => Promise<void>;
  reloadShared: () => void;
  switchUser: (userId: string) => void;
};

type WarehouseState = ReadyWarehouse | { ready: false; error: string | null };

const WarehouseContext = createContext<WarehouseState>({ ready: false, error: null });

function sessionOf(users: UserRow[]): UserRow | undefined {
  const stored = localStorage.getItem(USER_KEY);
  return users.find((user) => user.id === stored) ?? users.find((user) => user.role === "manager") ?? users[0];
}

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = useState<WarehouseState>({ ready: false, error: null });

  useEffect(() => {
    let cancelled = false;
    const opener = sharedLedger ? openSharedDb() : openBrowserDb();
    opener
      .then((db) => {
        if (cancelled) return;
        const users = listUsers(db);
        const session = sessionOf(users);
        if (!session) {
          setState({ ready: false, error: "no-users" });
          return;
        }
        localStorage.setItem(USER_KEY, session.id);
        setState({
          ready: true,
          db,
          users,
          session,
          revision: 0,
          shared: sharedLedger,
          notice: null,
          refresh: () => Promise.resolve(),
          reloadShared: () => undefined,
          switchUser: () => undefined,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ ready: false, error: error instanceof Error ? error.message : "load" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sharedLedger) return;
    const timer = setInterval(() => {
      void remoteRevision().then(async (remote) => {
        if (remote === knownRevision()) return;
        const db = await openSharedDb();
        setState((current) => {
          if (!current.ready) return current;
          const users = listUsers(db);
          const session = users.find((user) => user.id === current.session.id) ?? sessionOf(users);
          if (!session) return current;
          return { ...current, db, users, session, revision: current.revision + 1 };
        });
      });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const value = useMemo<WarehouseState>(() => {
    if (!state.ready) return state;
    return {
      ...state,
      refresh: () => {
        return (async () => {
          if (sharedLedger) {
            const result = await pushSharedDb();
            if (result === "conflict") {
              const db = await openSharedDb();
              setState((current) => {
                if (!current.ready) return current;
                const users = listUsers(db);
                const session = users.find((user) => user.id === current.session.id) ?? sessionOf(users);
                if (!session) return current;
                return { ...current, db, users, session, revision: current.revision + 1, notice: "conflict" };
              });
              return;
            }
          } else {
            await persistBrowserDb();
          }
          setState((current) => (current.ready ? { ...current, revision: current.revision + 1, users: listUsers(current.db), notice: null } : current));
        })();
      },
      reloadShared: () => {
        if (!sharedLedger) return;
        void openSharedDb().then((db) => {
          setState((current) => {
            if (!current.ready) return current;
            const users = listUsers(db);
            const session = users.find((user) => user.id === current.session.id) ?? sessionOf(users);
            if (!session) return current;
            return { ...current, db, users, session, revision: current.revision + 1 };
          });
        });
      },
      switchUser: (userId: string) => {
        setState((current) => {
          if (!current.ready) return current;
          const next = current.users.find((user) => user.id === userId);
          if (!next) return current;
          localStorage.setItem(USER_KEY, next.id);
          return { ...current, session: next };
        });
      },
    };
  }, [state]);

  return (
    <WarehouseContext.Provider value={value}>
      {value.ready ? (
        children
      ) : (
        <p className="p-8 text-sm">
          {value.error === "no-users" ? t("noUsers") : value.error === "load" ? t("loadError") : (value.error ?? t("loading"))}
        </p>
      )}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse(): ReadyWarehouse {
  const value = useContext(WarehouseContext);
  if (!value.ready) throw new Error("База ещё не открыта");
  return value;
}
