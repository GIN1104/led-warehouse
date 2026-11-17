"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n";
import { sharedLedger } from "@/lib/api";
import { openBrowserDb, persistBrowserDb } from "@/lib/db/browser";
import {
  LedgerOfflineWriteError,
  knownRevision,
  openSharedDbFromNetwork,
  openSharedDbPreferSnapshot,
  probeRemoteRevision,
  pushSharedDb,
  reopenFromSnapshot,
} from "@/lib/db/shared-client";
import type { Sql } from "@/lib/db/sql";
import { listUsers, type UserRow } from "@/lib/services/queries";

const USER_KEY = "lw_user";

type ReadyWarehouse = {
  ready: true;
  db: Sql;
  users: UserRow[];
  session: UserRow;
  revision: number;
  shared: boolean;
  /** Shared ledger недоступен — UI на last-known snapshot. */
  offline: boolean;
  snapshotSavedAt: string | null;
  /** Запись в общий ledger запрещена (offline). */
  writesBlocked: boolean;
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

function applyOpenedDb(
  current: ReadyWarehouse,
  db: Sql,
  patch: Partial<Pick<ReadyWarehouse, "offline" | "snapshotSavedAt" | "notice">>,
): ReadyWarehouse {
  const users = listUsers(db);
  const session = users.find((user) => user.id === current.session.id) ?? sessionOf(users);
  if (!session) return current;
  const offline = patch.offline ?? current.offline;
  return {
    ...current,
    db,
    users,
    session,
    revision: current.revision + 1,
    offline,
    writesBlocked: current.shared && offline,
    snapshotSavedAt: patch.snapshotSavedAt ?? current.snapshotSavedAt,
    notice: patch.notice !== undefined ? patch.notice : current.notice,
  };
}

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = useState<WarehouseState>({ ready: false, error: null });
  const latestRef = useRef(state);
  useEffect(() => {
    latestRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;

    if (sharedLedger) {
      void openSharedDbPreferSnapshot()
        .then((result) => {
          if (cancelled) return;
          const users = listUsers(result.db);
          const session = sessionOf(users);
          if (!session) {
            setState({ ready: false, error: "no-users" });
            return;
          }
          localStorage.setItem(USER_KEY, session.id);
          const offline = result.source === "snapshot";
          setState({
            ready: true,
            db: result.db,
            users,
            session,
            revision: result.revision,
            shared: true,
            offline,
            snapshotSavedAt: result.snapshotSavedAt,
            writesBlocked: offline,
            notice: offline ? "offline" : null,
            refresh: () => Promise.resolve(),
            reloadShared: () => undefined,
            switchUser: () => undefined,
          });
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setState({
              ready: false,
              error: error instanceof Error ? error.message : "load",
            });
          }
        });
    } else {
      void openBrowserDb()
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
            shared: false,
            offline: false,
            snapshotSavedAt: null,
            writesBlocked: false,
            notice: null,
            refresh: () => Promise.resolve(),
            reloadShared: () => undefined,
            switchUser: () => undefined,
          });
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setState({
              ready: false,
              error: error instanceof Error ? error.message : "load",
            });
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sharedLedger) return;
    const timer = setInterval(() => {
      void (async () => {
        const probe = await probeRemoteRevision();
        const latest = latestRef.current;
        if (!latest.ready || !latest.shared) return;

        if (!probe.ok) {
          if (latest.offline && (latest.notice === "offline" || latest.notice === "offline-write")) return;
          setState((current) => {
            if (!current.ready || !current.shared) return current;
            return {
              ...current,
              offline: true,
              writesBlocked: true,
              notice: current.notice === "conflict" ? current.notice : "offline",
            };
          });
          return;
        }

        if (!latest.offline && probe.revision === knownRevision()) return;

        try {
          const result = await openSharedDbFromNetwork();
          setState((current) => {
            if (!current.ready) return current;
            return applyOpenedDb(current, result.db, {
              offline: false,
              snapshotSavedAt: result.snapshotSavedAt,
              notice: null,
            });
          });
        } catch {
          setState((current) => {
            if (!current.ready || !current.shared) return current;
            return {
              ...current,
              offline: true,
              writesBlocked: true,
              notice: current.notice === "conflict" ? current.notice : "offline",
            };
          });
        }
      })();
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const value = useMemo<WarehouseState>(() => {
    if (!state.ready) return state;
    const offlineNow = state.offline;
    return {
      ...state,
      writesBlocked: state.shared && offlineNow,
      refresh: () => {
        return (async () => {
          if (sharedLedger && offlineNow) {
            const restored = await reopenFromSnapshot();
            if (restored) {
              setState((current) => {
                if (!current.ready) return current;
                return applyOpenedDb(current, restored.db, {
                  offline: true,
                  snapshotSavedAt: restored.snapshotSavedAt,
                  notice: "offline-write",
                });
              });
            } else {
              setState((current) =>
                current.ready ? { ...current, notice: "offline-write", writesBlocked: true, offline: true } : current,
              );
            }
            throw new LedgerOfflineWriteError();
          }
          if (sharedLedger) {
            try {
              const result = await pushSharedDb();
              if (result === "conflict") {
                const opened = await openSharedDbPreferSnapshot();
                setState((current) => {
                  if (!current.ready) return current;
                  return applyOpenedDb(current, opened.db, {
                    offline: opened.source === "snapshot",
                    snapshotSavedAt: opened.snapshotSavedAt,
                    notice: opened.source === "snapshot" ? "offline" : "conflict",
                  });
                });
                return;
              }
            } catch (error) {
              const restored = await reopenFromSnapshot();
              setState((current) => {
                if (!current.ready) return current;
                if (restored) {
                  return applyOpenedDb(current, restored.db, {
                    offline: true,
                    snapshotSavedAt: restored.snapshotSavedAt,
                    notice: "offline-write",
                  });
                }
                return { ...current, offline: true, writesBlocked: true, notice: "offline-write" };
              });
              throw error instanceof LedgerOfflineWriteError
                ? error
                : new LedgerOfflineWriteError(error instanceof Error ? error.message : undefined);
            }
          } else {
            await persistBrowserDb();
          }
          setState((current) =>
            current.ready
              ? {
                  ...current,
                  revision: current.revision + 1,
                  users: listUsers(current.db),
                  notice: null,
                  offline: false,
                  writesBlocked: false,
                }
              : current,
          );
        })();
      },
      reloadShared: () => {
        if (!sharedLedger) return;
        void openSharedDbPreferSnapshot()
          .then((opened) => {
            setState((current) => {
              if (!current.ready) return current;
              return applyOpenedDb(current, opened.db, {
                offline: opened.source === "snapshot",
                snapshotSavedAt: opened.snapshotSavedAt,
                notice: opened.source === "snapshot" ? "offline" : null,
              });
            });
          })
          .catch(() => {
            setState((current) =>
              current.ready ? { ...current, offline: true, writesBlocked: true, notice: "offline" } : current,
            );
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
