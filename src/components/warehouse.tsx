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
  /** Shared ledger недоступен — UI на last-known snapshot или local IndexedDB. */
  offline: boolean;
  snapshotSavedAt: string | null;
  /** Запись в общий ledger запрещена (offline snapshot). Local fallback пишет в IndexedDB. */
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

function buildReady(
  db: Sql,
  opts: {
    shared: boolean;
    offline: boolean;
    snapshotSavedAt: string | null;
    notice: string | null;
    revision?: number;
    previousSessionId?: string;
  },
): ReadyWarehouse | { ready: false; error: string } {
  const users = listUsers(db);
  const session =
    (opts.previousSessionId ? users.find((user) => user.id === opts.previousSessionId) : undefined) ?? sessionOf(users);
  if (!session) return { ready: false, error: "no-users" };
  localStorage.setItem(USER_KEY, session.id);
  return {
    ready: true,
    db,
    users,
    session,
    revision: opts.revision ?? 0,
    shared: opts.shared,
    offline: opts.offline,
    snapshotSavedAt: opts.snapshotSavedAt,
    writesBlocked: opts.shared && opts.offline,
    notice: opts.notice,
    refresh: () => Promise.resolve(),
    reloadShared: () => undefined,
    switchUser: () => undefined,
  };
}

function applyOpenedDb(
  current: ReadyWarehouse,
  db: Sql,
  patch: Partial<Pick<ReadyWarehouse, "shared" | "offline" | "snapshotSavedAt" | "notice">>,
): ReadyWarehouse {
  const users = listUsers(db);
  const session = users.find((user) => user.id === current.session.id) ?? sessionOf(users);
  if (!session) return current;
  const shared = patch.shared ?? current.shared;
  const offline = patch.offline ?? current.offline;
  return {
    ...current,
    db,
    users,
    session,
    revision: current.revision + 1,
    shared,
    offline,
    writesBlocked: shared && offline,
    snapshotSavedAt: patch.snapshotSavedAt !== undefined ? patch.snapshotSavedAt : current.snapshotSavedAt,
    notice: patch.notice !== undefined ? patch.notice : current.notice,
  };
}

/**
 * Shared API недоступен и нет snapshot: открываем локальную копию только для просмотра.
 * Запись блокируется (writesBlocked) — нельзя «успешно» сохранить только в IndexedDB,
 * пока в бандле задан ACCESS_API_BASE / shared ledger.
 */
async function openSharedBrowseOnly(): Promise<ReadyWarehouse | { ready: false; error: string }> {
  const db = await openBrowserDb();
  return buildReady(db, {
    shared: true,
    offline: true,
    snapshotSavedAt: null,
    notice: "offline",
  });
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

    async function boot() {
      if (!sharedLedger) {
        const db = await openBrowserDb();
        if (cancelled) return;
        setState(
          buildReady(db, {
            shared: false,
            offline: false,
            snapshotSavedAt: null,
            notice: null,
          }),
        );
        return;
      }

      try {
        const result = await openSharedDbPreferSnapshot();
        if (cancelled) return;
        const offline = result.source === "snapshot";
        setState(
          buildReady(result.db, {
            shared: true,
            offline,
            snapshotSavedAt: result.snapshotSavedAt,
            notice: offline ? "offline" : null,
            revision: result.revision,
          }),
        );
      } catch {
        // Нет сети и нет last-known → browse-only, запись в общий ledger запрещена.
        try {
          const local = await openSharedBrowseOnly();
          if (!cancelled) setState(local);
        } catch (error: unknown) {
          if (!cancelled) {
            setState({
              ready: false,
              error: error instanceof Error ? error.message : "load",
            });
          }
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Пока в бандле есть ACCESS_API_BASE — пробуем вернуться на shared из offline/browse-only.
  useEffect(() => {
    if (!sharedLedger) return;
    const timer = setInterval(() => {
      void (async () => {
        const probe = await probeRemoteRevision();
        const latest = latestRef.current;
        if (!latest.ready) return;

        if (!probe.ok) {
          if (!latest.shared) return;
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

        // Сеть жива: из offline/browse-only или stale shared — подтянуть ledger.
        if (latest.shared && !latest.offline && probe.revision === knownRevision()) return;

        try {
          const result = await openSharedDbFromNetwork();
          setState((current) => {
            if (!current.ready) return current;
            return applyOpenedDb(current, result.db, {
              shared: true,
              offline: false,
              snapshotSavedAt: result.snapshotSavedAt,
              notice: null,
            });
          });
        } catch {
          setState((current) => {
            if (!current.ready) return current;
            if (!current.shared) return current;
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
    const sharedNow = state.shared;
    const offlineNow = state.offline;
    return {
      ...state,
      writesBlocked: sharedNow && offlineNow,
      refresh: () => {
        return (async () => {
          // Shared + offline snapshot: destructive writes запрещены.
          if (sharedNow && offlineNow) {
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
          if (sharedNow) {
            try {
              const result = await pushSharedDb();
              if (result === "conflict") {
                const opened = await openSharedDbPreferSnapshot();
                setState((current) => {
                  if (!current.ready) return current;
                  return applyOpenedDb(current, opened.db, {
                    shared: true,
                    offline: opened.source === "snapshot",
                    snapshotSavedAt: opened.snapshotSavedAt,
                    notice: opened.source === "snapshot" ? "offline" : "conflict",
                  });
                });
                return;
              }
            } catch (error) {
              const restored = await reopenFromSnapshot();
              if (restored) {
                setState((current) => {
                  if (!current.ready) return current;
                  return applyOpenedDb(current, restored.db, {
                    shared: true,
                    offline: true,
                    snapshotSavedAt: restored.snapshotSavedAt,
                    notice: "offline-write",
                  });
                });
                throw error instanceof LedgerOfflineWriteError
                  ? error
                  : new LedgerOfflineWriteError(error instanceof Error ? error.message : undefined);
              }
              // Нет snapshot: не пишем «успех» в IndexedDB — shared mode fail-closed.
              setState((current) =>
                current.ready
                  ? {
                      ...current,
                      shared: true,
                      offline: true,
                      writesBlocked: true,
                      notice: "offline-write",
                    }
                  : current,
              );
              throw error instanceof LedgerOfflineWriteError
                ? error
                : new LedgerOfflineWriteError(error instanceof Error ? error.message : undefined);
            }
          } else {
            await persistBrowserDb();
          }
          setState((current) => {
            if (!current.ready) return current;
            // Чистый локальный режим (без ACCESS_API_BASE): IndexedDB ок.
            if (!current.shared) {
              return {
                ...current,
                revision: current.revision + 1,
                users: listUsers(current.db),
                writesBlocked: false,
              };
            }
            return {
              ...current,
              revision: current.revision + 1,
              users: listUsers(current.db),
              notice: null,
              offline: false,
              writesBlocked: false,
            };
          });
        })();
      },
      reloadShared: () => {
        if (!sharedLedger) return;
        void openSharedDbPreferSnapshot()
          .then((opened) => {
            setState((current) => {
              if (!current.ready) return current;
              return applyOpenedDb(current, opened.db, {
                shared: true,
                offline: opened.source === "snapshot",
                snapshotSavedAt: opened.snapshotSavedAt,
                notice: opened.source === "snapshot" ? "offline" : null,
              });
            });
          })
          .catch(() => {
            void openSharedBrowseOnly().then((local) => {
              if (local.ready) {
                setState((current) => {
                  if (!current.ready) return local;
                  const session =
                    listUsers(local.db).find((user) => user.id === current.session.id) ?? local.session;
                  return { ...local, session };
                });
              } else {
                setState(local);
              }
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
