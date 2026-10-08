"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { translateError } from "@/lib/i18n/messages";
import { createSku } from "@/lib/services/ledger";
import { listSkuSummaries } from "@/lib/services/queries";

export default function CatalogPage() {
  const { db, session, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "catalog.write");
  const rows = listSkuSummaries(db);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      assertCan(session.role, "catalog.write");
      createSku(
        db,
        {
          code: String(form.get("code") ?? ""),
          name: String(form.get("name") ?? ""),
          category: String(form.get("category") ?? ""),
          unit: String(form.get("unit") ?? ""),
          description: String(form.get("description") ?? ""),
        },
        session.id,
      );
      refresh();
      event.currentTarget.reset();
      setFlash({ ok: t("catalog.added") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("catalog.eyebrow")} title={t("catalog.title")} description={t("catalog.description")} />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-lg border border-line bg-sand">
          <table className="w-full min-w-[720px] text-start text-sm">
            <thead className="bg-paper text-xs tracking-wide text-ink/50 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">{t("catalog.code")}</th>
                <th className="px-3 py-2 font-medium">{t("catalog.name")}</th>
                <th className="px-3 py-2 font-medium">{t("catalog.category")}</th>
                <th className="px-3 py-2 font-medium">{t("catalog.onHand")}</th>
                <th className="px-3 py-2 font-medium">{t("catalog.freeToday")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.category}</td>
                  <td className="px-3 py-2">
                    {row.onHand} {row.unit}
                  </td>
                  <td className="px-3 py-2">
                    {row.availableToday} {row.unit}
                    {row.shortage > 0 ? (
                      <span className="ms-2">
                        <Badge tone="warn">{t("catalog.deficit", { qty: row.shortage })}</Badge>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Panel>
          <h2 className="mb-3 font-medium">{t("catalog.new")}</h2>
          {allowed ? (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <Field label={t("catalog.code")}>
                <input name="code" required className={controlClass} placeholder="CAB-P19" />
              </Field>
              <Field label={t("catalog.name")}>
                <input name="name" required className={controlClass} placeholder="LED P1.9" />
              </Field>
              <Field label={t("catalog.category")}>
                <input name="category" required className={controlClass} />
              </Field>
              <Field label={t("catalog.unit")}>
                <input name="unit" className={controlClass} defaultValue="шт" />
              </Field>
              <button type="submit" className={buttonClass("primary")}>
                {t("catalog.add")}
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink/60">{t("catalog.denied")}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
