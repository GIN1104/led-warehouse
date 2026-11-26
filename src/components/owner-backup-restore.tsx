"use client";

import { useCallback, useEffect, useState } from "react";
import { useEmailAuth } from "@/components/auth-gate";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Empty, Field, buttonClass, controlClass } from "@/components/ui";
import { sharedLedger } from "@/lib/api";
import {
  backupDownloadUrl,
  fetchBackupList,
  postBackupNow,
  postRestoreBackup,
} from "@/lib/backup/client";
import { isBackupOwnerEmail, RESTORE_CONFIRM_PHRASE } from "@/lib/backup/owner";
import type { BackupEntry } from "@/lib/backup/store";
import { translateError } from "@/lib/i18n/messages";

/**
 * Owner-only блок на /me (кнопки только starchenkogin).
 * Целевая папка dump — Google Drive ledvision2026.il@gmail.com (не personal starchenkogin).
 */
export function OwnerBackupRestore() {
  const { session: auth } = useEmailAuth();
  const { refresh } = useWarehouse();
  const { t, lang } = useI18n();
  const email = auth?.email ?? "";

  const [status, setStatus] = useState<{ configured: boolean; mode: "live" | "mock" }>({
    configured: false,
    mode: "mock",
  });
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [confirm, setConfirm] = useState("");

  const load = useCallback(async () => {
    if (!isBackupOwnerEmail(email) || !sharedLedger) return;
    setError(null);
    try {
      const data = await fetchBackupList(email);
      if (!data.ok) {
        setError(data.error ?? t("me.backup.loadError"));
        return;
      }
      if (data.status) setStatus(data.status);
      setBackups(data.backups ?? []);
    } catch (err) {
      setError(translateError(lang, err));
    }
  }, [email, lang, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isBackupOwnerEmail(email)) return null;

  async function onCreate() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const result = await postBackupNow(email);
      if (!result.ok) throw new Error(result.error ?? t("me.backup.createError"));
      const mode = result.mode ?? status.mode;
      setOk(t(mode === "live" ? "me.backup.created" : "me.backup.createdMock"));
      if (result.mode) {
        setStatus({ configured: result.mode === "live", mode: result.mode });
      }
      await load();
    } catch (err) {
      setError(translateError(lang, err));
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    if (!selectedKey) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const result = await postRestoreBackup({
        actorEmail: email,
        key: selectedKey,
        confirm,
      });
      if (!result.ok) throw new Error(result.error ?? t("me.backup.restoreError"));
      setOk(t("me.backup.restored", { revision: String(result.revision ?? "") }));
      setConfirm("");
      setPanelOpen(false);
      await refresh();
      await load();
    } catch (err) {
      setError(translateError(lang, err));
    } finally {
      setBusy(false);
    }
  }

  function openPanel() {
    setPanelOpen(true);
    setSelectedKey("");
    setConfirm("");
    setError(null);
    setOk(null);
  }

  return (
    <section className="mt-6 rounded-md border border-amber-700/25 bg-amber-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-medium">{t("me.backup.title")}</h2>
        <Badge tone="warn">{t("me.backup.ownerOnly")}</Badge>
      </div>
      <p className="mb-4 text-sm leading-6 text-ink/70">{t("me.backup.help")}</p>

      {!sharedLedger ? (
        <p className="text-sm text-ink/65">{t("me.backup.needShared")}</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            <Badge tone={status.configured ? "ok" : "warn"}>
              Google Drive: {status.configured ? t("me.backup.live") : t("me.backup.mock")}
            </Badge>
          </div>

          {!status.configured ? (
            <p className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-950" role="status">
              {t("me.backup.needDriveSecrets")}
            </p>
          ) : null}

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass("ghost")}
              disabled={busy || !status.configured}
              onClick={() => void onCreate()}
            >
              {t("me.backup.createNow")}
            </button>
            <button type="button" className={buttonClass("ghost")} disabled={busy} onClick={() => void load()}>
              {t("me.backup.refresh")}
            </button>
            <button
              type="button"
              className={buttonClass(panelOpen ? "primary" : "ghost")}
              disabled={busy || !status.configured}
              onClick={() => openPanel()}
            >
              {t("me.backup.restoreDrive")}
            </button>
          </div>

          {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}
          {ok ? <p className="mb-3 text-sm text-emerald-800">{ok}</p> : null}

          {panelOpen ? (
            <div className="rounded-md border border-line bg-white/80 p-3">
              <h3 className="mb-2 font-medium">{t("me.backup.restoreDrive")}</h3>
              <p className="mb-3 text-sm text-ink/65">{t("me.backup.danger")}</p>
              {backups.length === 0 ? (
                <Empty>{t(status.configured ? "me.backup.empty" : "me.backup.emptyMock")}</Empty>
              ) : null}
              <ul className="mb-3 flex max-h-56 flex-col gap-2 overflow-auto">
                {backups.map((row) => (
                  <li key={row.key}>
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-line px-2 py-2 text-sm hover:bg-white">
                      <input
                        type="radio"
                        name="backupKey"
                        className="mt-1"
                        checked={selectedKey === row.key}
                        onChange={() => setSelectedKey(row.key)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{row.name}</span>
                        <span className="block text-xs text-ink/50">
                          {row.lastModified ?? "—"} · {row.size} B · {row.mode}
                        </span>
                      </span>
                      <a
                        className="shrink-0 text-xs underline"
                        href={backupDownloadUrl(email, row.key)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("me.backup.download")}
                      </a>
                    </label>
                  </li>
                ))}
              </ul>
              <Field label={t("me.backup.confirmLabel", { phrase: RESTORE_CONFIRM_PHRASE })}>
                <input
                  className={controlClass}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder={RESTORE_CONFIRM_PHRASE}
                  autoComplete="off"
                />
              </Field>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass("primary")}
                  disabled={busy || !selectedKey || confirm.trim() !== RESTORE_CONFIRM_PHRASE}
                  onClick={() => void onRestore()}
                >
                  {t("me.backup.confirmRestore")}
                </button>
                <button
                  type="button"
                  className={buttonClass("ghost")}
                  disabled={busy}
                  onClick={() => setPanelOpen(false)}
                >
                  {t("me.backup.cancel")}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
