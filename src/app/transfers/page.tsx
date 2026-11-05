"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Empty, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { listSkuSummaries, listLocations } from "@/lib/services/queries";
import {
  cancelTransfer,
  listTransfers,
  planTransfer,
  receiveTransfer,
  shipTransfer,
} from "@/lib/services/transfers";

export default function TransfersPage() {
  const { db, session, users, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "transfer.write");
  const rows = listTransfers(db);
  const skus = listSkuSummaries(db);
  const locations = listLocations(db);
  const drivers = users.filter((user) => user.role === "driver" || user.role === "logistics" || user.role === "warehouse");
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  async function onPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      assertCan(session.role, "transfer.write");
      planTransfer(
        db,
        {
          skuId: String(data.get("skuId") ?? ""),
          qty: Number(data.get("qty") ?? 0),
          fromLocationId: String(data.get("fromLocationId") ?? ""),
          toLocationId: String(data.get("toLocationId") ?? ""),
          driverUserId: String(data.get("driverUserId") ?? "") || null,
          note: String(data.get("note") ?? ""),
        },
        session.id,
      );
      form.reset();
      await refresh();
      setFlash({ ok: t("transfers.planned") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function act(id: string, kind: "ship" | "receive" | "cancel") {
    try {
      assertCan(session.role, "transfer.write");
      if (kind === "ship") shipTransfer(db, id, session.id);
      else if (kind === "receive") receiveTransfer(db, id, session.id);
      else cancelTransfer(db, id, session.id);
      await refresh();
      setFlash({ ok: t(`transfers.${kind}Ok` as MessageKey) });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("transfers.eyebrow")} title={t("transfers.title")} description={t("transfers.description")} />
      <Flash error={flash.error} ok={flash.ok} />
      {!allowed ? <p className="mb-4 text-sm text-ink/70">{t("transfers.forbidden")}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel>
          <h2 className="mb-3 font-medium">{t("transfers.list")}</h2>
          {rows.length === 0 ? <Empty>{t("transfers.empty")}</Empty> : null}
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-md border border-line bg-white p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      row.status === "received" ? "ok" : row.status === "cancelled" ? "neutral" : row.status === "in_transit" ? "warn" : "neutral"
                    }
                  >
                    {t(`transfers.status.${row.status}` as MessageKey)}
                  </Badge>
                  <span className="font-medium">
                    {row.skuCode} × {row.qty} {row.unit}
                  </span>
                  <span className="text-xs text-ink/45">{formatDateTime(row.createdAt)}</span>
                </div>
                <p>
                  {row.fromLocationName} → {row.toLocationName}
                </p>
                {row.driverName ? <p className="text-ink/60">{t("transfers.driver")}: {row.driverName}</p> : null}
                {row.note ? <p className="text-ink/60">{row.note}</p> : null}
                {allowed ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.status === "planned" ? (
                      <button type="button" className={buttonClass("primary")} onClick={() => void act(row.id, "ship")}>
                        {t("transfers.ship")}
                      </button>
                    ) : null}
                    {row.status === "in_transit" ? (
                      <button type="button" className={buttonClass("primary")} onClick={() => void act(row.id, "receive")}>
                        {t("transfers.receive")}
                      </button>
                    ) : null}
                    {row.status === "planned" || row.status === "in_transit" ? (
                      <button type="button" className={buttonClass("danger")} onClick={() => void act(row.id, "cancel")}>
                        {t("transfers.cancel")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>

        {allowed ? (
          <Panel>
            <h2 className="mb-3 font-medium">{t("transfers.new")}</h2>
            <form onSubmit={(event) => void onPlan(event)} className="flex flex-col gap-3">
              <Field label={t("transfers.sku")}>
                <select name="skuId" required className={controlClass} defaultValue={skus[0]?.id ?? ""}>
                  {skus.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.code} — {sku.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("transfers.qty")}>
                <input name="qty" type="number" min={1} required defaultValue={1} className={controlClass} />
              </Field>
              <Field label={t("transfers.from")}>
                <select name="fromLocationId" required className={controlClass} defaultValue={locations[0]?.id ?? ""}>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({t(`loc.${loc.kind}` as MessageKey)})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("transfers.to")}>
                <select name="toLocationId" required className={controlClass} defaultValue={locations.find((l) => l.kind === "site")?.id ?? locations[1]?.id ?? ""}>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({t(`loc.${loc.kind}` as MessageKey)})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("transfers.driver")}>
                <select name="driverUserId" className={controlClass} defaultValue="">
                  <option value="">{t("common.none")}</option>
                  {drivers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("transfers.note")}>
                <input name="note" className={controlClass} maxLength={500} />
              </Field>
              <button type="submit" className={buttonClass("primary", "self-start")}>
                {t("transfers.plan")}
              </button>
            </form>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
