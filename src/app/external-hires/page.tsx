"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Flash, PageHeader, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { orderHref } from "@/lib/paths";
import { setHireStatus } from "@/lib/services/ledger";
import { listExternalHires } from "@/lib/services/queries";

const tone = {
  needed: "alert",
  ordered: "warn",
  received: "ok",
  closed: "neutral",
} as const;

export default function ExternalHiresPage() {
  const { db, session, users, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "hire.write");
  const rows = listExternalHires(db);
  const manager = users.find((user) => user.role === "manager")?.name ?? "";
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const status = submitter instanceof HTMLButtonElement ? submitter.value : "";
    try {
      assertCan(session.role, "hire.write");
      if (status !== "needed" && status !== "ordered" && status !== "received" && status !== "closed") {
        throw new Error("status");
      }
      setHireStatus(db, String(form.get("id") ?? ""), status, String(form.get("supplierNote") ?? ""), session.id);
      refresh();
      setFlash({ ok: t("hires.updated") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("hires.eyebrow")} title={t("hires.title")} description={t("hires.description")} />
      <Flash error={flash.error} ok={flash.ok} />
      {!allowed ? <p className="mb-4 text-sm text-ink/60">{t("hires.switch", { name: manager })}</p> : null}
      <div className="flex flex-col gap-3">
        {rows.length === 0 ? <p className="text-sm text-ink/60">{t("hires.empty")}</p> : null}
        {rows.map((hire) => (
          <article key={hire.id} className="rounded-lg border border-line bg-sand p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {hire.skuCode} · {hire.qty} {hire.unit}
                </p>
                <p className="text-sm text-ink/70">{hire.skuName}</p>
                <Link href={orderHref(hire.orderId)} className="text-sm text-copper">
                  {hire.customerName}
                </Link>
              </div>
              <Badge tone={tone[hire.status]}>{t(`hire.${hire.status}` as MessageKey)}</Badge>
            </div>
            {allowed && hire.status !== "closed" ? (
              <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                <input type="hidden" name="id" value={hire.id} />
                <input
                  name="supplierNote"
                  defaultValue={hire.supplierNote}
                  placeholder={t("hires.note")}
                  className={`${controlClass} md:flex-1`}
                />
                {hire.status === "needed" ? (
                  <button name="status" value="ordered" className="rounded-md bg-copper px-3 py-2 text-sm text-white">
                    {t("hire.ordered")}
                  </button>
                ) : null}
                {hire.status === "ordered" || hire.status === "needed" ? (
                  <button name="status" value="received" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
                    {t("hire.received")}
                  </button>
                ) : null}
                <button name="status" value="closed" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
                  {t("hire.closed")}
                </button>
              </form>
            ) : hire.supplierNote ? (
              <p className="mt-2 text-sm text-ink/60">{hire.supplierNote}</p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
