"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { openBrowserDb, persistBrowserDb } from "@/lib/db/browser";
import type { Sql } from "@/lib/db/sql";
import { listUsers, type UserRow } from "@/lib/services/queries";

const USER_KEY = "lw_user";

type ReadyWarehouse = {
  ready: true;
  db: Sql;
  users: UserRow[];
  session: UserRow;
  revision: number;
  refresh: () => void;
  switchUser: (userId: string) => void;
};

type WarehouseState = ReadyWarehouse | { ready: false; error: string | null };

const WarehouseContext = createContext<WarehouseState>({ ready: false, error: null });

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WarehouseState>({ ready: false, error: null });

  useEffect(() => {
    let cancelled = false;
    openBrowserDb()
      .then((db) => {
        if (cancelled) return;
        const users = listUsers(db);
        const stored = localStorage.getItem(USER_KEY);
        const session = users.find((user) => user.id === stored) ?? users.find((user) => user.role === "manager") ?? users[0];
        if (!session) {
          setState({ ready: false, error: "В базе нет пользователей" });
          return;
        }
        localStorage.setItem(USER_KEY, session.id);
        setState({
          ready: true,
          db,
          users,
          session,
          revision: 0,
          refresh: () => undefined,
          switchUser: () => undefined,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ ready: false, error: error instanceof Error ? error.message : "Не удалось открыть базу" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<WarehouseState>(() => {
    if (!state.ready) return state;
    return {
      ...state,
      refresh: () => {
        void persistBrowserDb();
        setState((current) => (current.ready ? { ...current, revision: current.revision + 1, users: listUsers(current.db) } : current));
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
        <p className="p-8 text-sm">{value.error ?? "Открываем базу в этом браузере…"}</p>
      )}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse(): ReadyWarehouse {
  const value = useContext(WarehouseContext);
  if (!value.ready) throw new Error("База ещё не открыта");
  return value;
}
