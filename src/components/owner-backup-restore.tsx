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
import type { BackupTarget } from "@/lib/backup/config";
import type { BackupEntry } from "@/lib/backup/store";
import { translateError } from "@/lib/i18n/messages";

type TargetState = {
  configured: boolean;
  mode: "live" | "mock";
};

/**
 * Owner-only блок на /me. ledvision2026 и остальные не рендерят этот компонент
 * (проверка email до mount UI).
 */
export function OwnerBackupRestore() {
  const { session: auth } = useEmailAuth();
  const { refresh } = useWarehouse();
  const { t, lang } = useI18n();
  const email = auth?.email ?? "";

  const [r2, setR2] = useState<TargetState>({ configured: false, mode: "mock" });
  const [drive, setDrive] = useState<TargetState>({ configured: false, mode: "mock" });
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<BackupTarget | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [confirm, setConfirm] = useState("");

  const load = useCallback(async () => {
    if (!isBackupOwnerEmail(email) || !sharedLedger) return;
    setError(null);
    try {
      const data = await fetchBackupList(email, "all");
      if (!data.ok) {
        setError(data.error ?? t("me.backup.loadError"));
        return;
      }
      if (data.status) {
        setR2(data.status.r2);
        setDrive(data.status.drive);
      }
      setBackups(data.backups ?? []);
    } catch (err) {
      setError(translateError(lang, err));
    }
  }, [email, lang, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isBackupOwnerEmail(email)) return null;

  const forTarget = (target: BackupTarget) => backups.filter((row) => row.target === target);

  async function onCreate() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const result = await postBackupNow(email);
      if (!result.ok) throw new Error(result.error ?? t("me.backup.createError"));
      setOk(t("me.backup.created"));
      await load();
    } catch (err) {
      setError(translateError(lang, err));
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    if (!panel || !selectedKey) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const result = await postRestoreBackup({
        actorEmail: email,
        target: panel,
        key: selectedKey,
        confirm,
      });
      if (!result.ok) throw new Error(result.error ?? t("me.backup.restoreError"));
      setOk(t("me.backup.restored", { revision: String(result.revision ?? "") }));
      setConfirm("");
      setPanel(null);
      await refresh();
      await load();
    } catch (err) {
      setError(translateError(lang, err));
    } finally {
      setBusy(false);
    }
  }

  function openPanel(target: BackupTarget) {
    setPanel(target);
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
            <Badge tone={r2.configured ? "ok" : "neutral"}>
              Cloudflare R2: {r2.configured ? t("me.backup.live") : t("me.backup.mock")}
            </Badge>
            <Badge tone={drive.configured ? "ok" : "neutral"}>
              Google Drive: {drive.configured ? t("me.backup.live") : t("me.backup.mock")}
            </Badge>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" className={buttonClass("ghost")} disabled={busy} onClick={() => void onCreate()}>
              {t("me.backup.createNow")}
            </button>
            <button type="button" className={buttonClass("ghost")} disabled={busy} onClick={() => void load()}>
              {t("me.backup.refresh")}
            </button>
            <button
              type="button"
              className={buttonClass(panel === "drive" ? "primary" : "ghost")}
              disabled={busy}
              onClick={() => openPanel("drive")}
            >
              {t("me.backup.restoreDrive")}
            </button>
            <button
              type="button"
              className={buttonClass(panel === "r2" ? "primary" : "ghost")}
              disabled={busy}
              onClick={() => openPanel("r2")}
            >
              {t("me.backup.restoreR2")}
            </button>
          </div>

          {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}
          {ok ? <p className="mb-3 text-sm text-emerald-800">{ok}</p> : null}

          {panel ? (
            <div className="rounded-md border border-line bg-white/80 p-3">
              <h3 className="mb-2 font-medium">
                {panel === "drive" ? t("me.backup.restoreDrive") : t("me.backup.restoreR2")}
              </h3>
              <p className="mb-3 text-sm text-ink/65">{t("me.backup.danger")}</p>
              {forTarget(panel).length === 0 ? <Empty>{t("me.backup.empty")}</Empty> : null}
              <ul className="mb-3 flex max-h-56 flex-col gap-2 overflow-auto">
                {forTarget(panel).map((row) => (
                  <li key={`${row.target}:${row.key}`}>
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
                        href={backupDownloadUrl(email, row.target, row.key)}
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
                <button type="button" className={buttonClass("ghost")} disabled={busy} onClick={() => setPanel(null)}>
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
