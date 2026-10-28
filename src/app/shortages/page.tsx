"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { orderHref } from "@/lib/paths";
import { setHireStatus } from "@/lib/services/ledger";
import { listOpenShortages, shortageLifecycleCounts } from "@/lib/services/shortages";

const steps = ["needed", "ordered", "received"] as const;

const tone = {
  needed: "alert",
  ordered: "warn",
  received: "ok",
  closed: "neutral",
} as const;

function Lifecycle({ status }: { status: "needed" | "ordered" | "received" | "closed" | null }) {
  const { t } = useI18n();
  const rank = status === "closed" ? 3 : status === "received" ? 2 : status === "ordered" ? 1 : status === "needed" ? 0 : -1;
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11px]" aria-label={t("shortages.lifecycle")}>
      {steps.map((step, index) => {
        const active = status === step;
        const done = rank > index || status === "closed";
        return (
          <li key={step} className="inline-flex items-center gap-1">
            {index > 0 ? <span className="text-ink/30">→</span> : null}
            <span
              className={
                active
                  ? "rounded bg-copper px-1.5 py-0.5 font-medium text-white"
                  : done
                    ? "rounded bg-moss/20 px-1.5 py-0.5 text-moss"
                    : "rounded bg-ink/5 px-1.5 py-0.5 text-ink/45"
              }
            >
              {t(`hire.${step}` as MessageKey)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function ShortagesPage() {
  const { db, session, users, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "hire.write");
  const manager = users.find((user) => user.role === "manager")?.name ?? "";
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  const rows = useMemo(() => {
    void revision;
    return listOpenShortages(db);
  }, [db, revision]);
  const counts = useMemo(() => {
    void revision;
    return shortageLifecycleCounts(db);
  }, [db, revision]);

  function onHire(event: FormEvent<HTMLFormElement>) {
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

  const cards = [
    { label: t("shortages.open"), value: counts.openShortages },
    { label: t("shortages.units"), value: counts.shortageUnits },
    { label: t("shortages.needed"), value: counts.needed },
    { label: t("shortages.ordered"), value: counts.ordered },
    { label: t("shortages.received"), value: counts.received },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={t("shortages.eyebrow")}
        title={t("shortages.title")}
        description={t("shortages.description")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/occupancy/" className={buttonClass("ghost")}>
              {t("shortages.occupancyLink")}
            </Link>
            <Link href="/external-hires/" className={buttonClass("ghost")}>
              {t("shortages.hireLink")}
            </Link>
          </div>
        }
      />
      <Flash error={flash.error} ok={flash.ok} />
      {!allowed ? <p className="mb-4 text-sm text-ink/60">{t("hires.switch", { name: manager })}</p> : null}

      <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Panel key={card.label} className="max-md:p-3">
            <p className="text-[11px] tracking-wide text-ink/50 uppercase">{card.label}</p>
            <p className="mt-1 font-mono text-2xl font-medium tabular-nums">{card.value}</p>
          </Panel>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink/60">{t("shortages.empty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <article key={row.lineId} className="rounded-lg border border-line bg-sand p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {row.skuCode} · −{row.qtyShortage} {row.unit}
                  </p>
                  <p className="text-sm text-ink/70">{row.skuName}</p>
                  <p className="mt-1 text-sm">
                    <Link href={orderHref(row.orderId)} className="text-copper hover:underline">
                      {row.customerName}
                    </Link>
                    <span className="text-ink/50">
                      {" · "}
                      {formatDate(row.startDate)}–{formatDate(row.endDate)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-ink/50 tabular-nums">
                    {t("eq.summaryTotal")}: {row.qtyRequested} · soft: {row.qtySoftReserved}
                  </p>
                </div>
                {row.hireStatus ? <Badge tone={tone[row.hireStatus]}>{t(`hire.${row.hireStatus}` as MessageKey)}</Badge> : null}
              </div>

              <div className="mt-3">
                <Lifecycle status={row.hireStatus} />
              </div>

              <div className="mt-3 rounded-md border border-line/80 bg-paper/50 px-3 py-2">
                <p className="text-xs font-medium tracking-wide text-ink/50 uppercase">{t("shortages.alts")}</p>
                {row.alternatives.length === 0 ? (
                  <p className="mt-1 text-sm text-ink/55">{t("shortages.altsEmpty")}</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1">
                    {row.alternatives.map((alt) => (
                      <li key={alt.skuId} className="text-sm">
                        <span className="font-mono text-xs">{alt.skuCode}</span>
                        <span className="text-ink/70"> · {alt.skuName}</span>
                        <span className="text-ink/50">
                          {" — "}
                          {t("shortages.altFree", { qty: alt.availableToday, unit: alt.unit })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {allowed && row.hireId && row.hireStatus && row.hireStatus !== "closed" ? (
                <form onSubmit={onHire} className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                  <input type="hidden" name="id" value={row.hireId} />
                  <input
                    name="supplierNote"
                    defaultValue={row.supplierNote}
                    placeholder={t("hires.note")}
                    className={`${controlClass} md:flex-1`}
                  />
                  {row.hireStatus === "needed" ? (
                    <button name="status" value="ordered" className="rounded-md bg-copper px-3 py-2 text-sm text-white">
                      {t("hire.ordered")}
                    </button>
                  ) : null}
                  {row.hireStatus === "ordered" || row.hireStatus === "needed" ? (
                    <button name="status" value="received" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
                      {t("hire.received")}
                    </button>
                  ) : null}
                  <button name="status" value="closed" className="rounded-md border border-line bg-white px-3 py-2 text-sm">
                    {t("hire.closed")}
                  </button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
