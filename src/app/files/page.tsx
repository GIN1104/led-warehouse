"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileImage, FileText, Link2, Paperclip, Trash2 } from "lucide-react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Empty, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { translateError } from "@/lib/i18n/messages";
import { filesHref, orderHref } from "@/lib/paths";
import {
  ORDER_FILES_MAX_COUNT,
  orderFilesApi,
  type OrderAttachedFile,
  type OrderFilesBundle,
} from "@/lib/services/order-files";
import { listOrders } from "@/lib/services/queries";
import { cn } from "@/lib/utils";

function FilesFallback() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader eyebrow={t("files.eyebrow")} title={t("files.title")} description={t("files.description")} />
      <p className="text-sm text-ink/60">{t("loading")}</p>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function FileKindIcon({ file }: { file: OrderAttachedFile }) {
  if (file.kind === "image") return <FileImage size={16} className="shrink-0 text-copper" aria-hidden />;
  if (file.kind === "pdf" || file.kind === "sheet") return <FileText size={16} className="shrink-0 text-copper" aria-hidden />;
  return <Paperclip size={16} className="shrink-0 text-ink/50" aria-hidden />;
}

function FilesPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const orderId = params.get("orderId") ?? params.get("id") ?? "";
  const { db, session, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "order.write");
  const orders = listOrders(db);
  void revision;

  const [bundle, setBundle] = useState<OrderFilesBundle | null>(null);
  const [equipmentList, setEquipmentList] = useState("");
  const [sheetLinksText, setSheetLinksText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [removeFileIds, setRemoveFileIds] = useState<string[]>([]);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const order = useMemo(() => orders.find((row) => row.id === orderId) ?? null, [orders, orderId]);

  useEffect(() => {
    if (!orderId) {
      setBundle(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void orderFilesApi
      .list(orderId)
      .then((next) => {
        if (cancelled) return;
        setBundle(next);
        setEquipmentList(next.equipmentList);
        setSheetLinksText(next.sheetLinks.join("\n"));
        setPendingFiles([]);
        setRemoveFileIds([]);
        setFlash({});
      })
      .catch((error) => {
        if (!cancelled) setFlash({ error: translateError(lang, error) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, lang]);

  const visibleFiles = useMemo(
    () => (bundle?.files ?? []).filter((file) => !removeFileIds.includes(file.id)),
    [bundle, removeFileIds],
  );

  function onPickOrder(nextId: string) {
    router.replace(filesHref(nextId));
  }

  function onChooseFiles(list: FileList | null) {
    if (!list?.length) return;
    setPendingFiles((prev) => [...prev, ...Array.from(list)].slice(0, ORDER_FILES_MAX_COUNT));
  }

  function markRemove(id: string) {
    setRemoveFileIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  async function onSave(event: FormEvent, notifyStaff: boolean) {
    event.preventDefault();
    if (!orderId) return;
    try {
      setBusy(true);
      assertCan(session.role, "order.write");
      const result = await orderFilesApi.save(orderId, {
        equipmentList,
        sheetLinksText,
        newFiles: pendingFiles,
        removeFileIds,
        notifyStaff,
      });
      setBundle(result.bundle);
      setEquipmentList(result.bundle.equipmentList);
      setSheetLinksText(result.bundle.sheetLinks.join("\n"));
      setPendingFiles([]);
      setRemoveFileIds([]);
      const parts: string[] = [t("files.saved")];
      if (notifyStaff && (result.notifiedFileIds.length || result.notifiedLinks.length)) {
        parts.push(t("files.notified"));
      } else if (notifyStaff) {
        parts.push(t("files.nothingNew"));
      }
      if (result.removedLinkSilent) parts.push(t("files.linkRemovedSilent"));
      setFlash({ ok: parts.join(" ") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("files.eyebrow")}
        title={t("files.title")}
        description={t("files.description")}
        action={
          orderId ? (
            <Link href={orderHref(orderId)} className={buttonClass("ghost")}>
              {t("files.back")}
            </Link>
          ) : null
        }
      />
      <Flash error={flash.error} ok={flash.ok} />

      <Panel className="mb-4">
        <Field label={t("files.order")}>
          <select
            value={orderId}
            onChange={(event) => onPickOrder(event.target.value)}
            className={controlClass}
          >
            <option value="">{t("files.orderPick")}</option>
            {orders.map((row) => (
              <option key={row.id} value={row.id}>
                {row.customerName}
              </option>
            ))}
          </select>
        </Field>
        {order ? (
          <p className="mt-2 text-sm text-ink/60">
            <Link href={orderHref(order.id)} className="text-copper underline">
              {order.customerName}
            </Link>
            {" · "}
            <span dir="ltr">
              {order.startDate} — {order.endDate}
            </span>
          </p>
        ) : null}
      </Panel>

      {!orderId ? (
        <Empty>{t("files.needOrder")}</Empty>
      ) : loading || !bundle ? (
        <p className="text-sm text-ink/60">{t("loading")}</p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => void onSave(event, true)}
        >
          <Panel>
            <h2 className="mb-1 font-medium">{t("files.equipment")}</h2>
            <p className="mb-3 text-sm text-ink/60">{t("files.equipmentHelp")}</p>
            <textarea
              value={equipmentList}
              onChange={(event) => setEquipmentList(event.target.value)}
              rows={5}
              placeholder={t("files.equipmentPlaceholder")}
              disabled={!allowed || busy}
              className={cn(controlClass, "h-auto min-h-[7rem] w-full resize-y py-2")}
            />
          </Panel>

          <Panel>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-medium">{t("files.attachments")}</h2>
                <p className="mt-1 text-sm text-ink/60">{t("files.attachmentsHelp")}</p>
              </div>
              <Badge tone="neutral">
                {visibleFiles.length + pendingFiles.length}/{ORDER_FILES_MAX_COUNT}
              </Badge>
            </div>

            {visibleFiles.length === 0 && pendingFiles.length === 0 ? (
              <Empty>{t("files.attachmentsEmpty")}</Empty>
            ) : (
              <ul className="mb-3 flex flex-col gap-2">
                {visibleFiles.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper/60 px-3 py-2 text-sm"
                  >
                    <FileKindIcon file={file} />
                    <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                    <span className="text-ink/50">{formatSize(file.sizeBytes)}</span>
                    <Badge tone={file.notified ? "ok" : "warn"}>
                      {file.notified ? t("files.notifiedBadge") : t("files.pendingBadge")}
                    </Badge>
                    <span className="text-xs text-ink/45">{formatDateTime(file.addedAt)}</span>
                    {allowed ? (
                      <button
                        type="button"
                        className={buttonClass("ghost", "h-8 px-2")}
                        onClick={() => markRemove(file.id)}
                        aria-label={t("files.remove")}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </li>
                ))}
                {pendingFiles.map((file, index) => (
                  <li
                    key={`pending-${file.name}-${index}`}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-copper/40 bg-copper/5 px-3 py-2 text-sm"
                  >
                    <Paperclip size={16} className="shrink-0 text-copper" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                    <span className="text-ink/50">{formatSize(file.size)}</span>
                    <Badge tone="warn">{t("files.newBadge")}</Badge>
                    {allowed ? (
                      <button
                        type="button"
                        className={buttonClass("ghost", "h-8 px-2")}
                        onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                        aria-label={t("files.remove")}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {allowed ? (
              <Field label={t("files.upload")}>
                <input
                  type="file"
                  multiple
                  disabled={busy}
                  onChange={(event) => {
                    onChooseFiles(event.target.files);
                    event.target.value = "";
                  }}
                  className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-md file:border-0 file:bg-copper file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-copper-dark"
                />
              </Field>
            ) : (
              <p className="text-sm text-ink/60">{t("files.writeNeedManager")}</p>
            )}
            <p className="mt-2 text-xs text-ink/50">{t("files.sizeLimits")}</p>
          </Panel>

          <Panel>
            <h2 className="mb-1 flex items-center gap-2 font-medium">
              <Link2 size={16} aria-hidden />
              {t("files.links")}
            </h2>
            <p className="mb-3 text-sm text-ink/60">{t("files.linksHelp")}</p>
            <textarea
              value={sheetLinksText}
              onChange={(event) => setSheetLinksText(event.target.value)}
              rows={4}
              placeholder={t("files.linksPlaceholder")}
              disabled={!allowed || busy}
              className={cn(controlClass, "h-auto min-h-[6rem] w-full resize-y py-2 font-mono text-xs")}
            />
          </Panel>

          <div className="flex flex-wrap gap-2">
            {allowed ? (
              <>
                <button type="submit" disabled={busy} className={buttonClass("primary")}>
                  {busy ? t("files.saving") : t("files.saveSend")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={buttonClass("ghost")}
                  onClick={(event) => void onSave(event, false)}
                >
                  {t("files.saveOnly")}
                </button>
              </>
            ) : null}
            <Link href={orderHref(orderId)} className={buttonClass("ghost")}>
              {t("files.back")}
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function FilesPage() {
  return (
    <Suspense fallback={<FilesFallback />}>
      <FilesPageInner />
    </Suspense>
  );
}
