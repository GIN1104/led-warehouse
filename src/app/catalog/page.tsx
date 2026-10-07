"use client";

import { useState, type FormEvent } from "react";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can, errorText } from "@/lib/auth";
import { createSku } from "@/lib/services/ledger";
import { listSkuSummaries } from "@/lib/services/queries";

export default function CatalogPage() {
  const { db, session, refresh, revision } = useWarehouse();
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
      setFlash({ ok: "Позиция добавлена" });
    } catch (error) {
      setFlash({ error: errorText(error) });
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Справочник"
        title="Номенклатура"
        description="Кабинеты, кабели и расходники учитываются по количеству. Серийные номера на этой фазе не ведутся."
      />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-lg border border-line bg-sand">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-paper text-xs tracking-wide text-ink/50 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Код</th>
                <th className="px-3 py-2 font-medium">Название</th>
                <th className="px-3 py-2 font-medium">Категория</th>
                <th className="px-3 py-2 font-medium">На руках</th>
                <th className="px-3 py-2 font-medium">Свободно сегодня</th>
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
                      <span className="ml-2">
                        <Badge tone="warn">дефицит {row.shortage}</Badge>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Panel>
          <h2 className="mb-3 font-medium">Новая позиция</h2>
          {allowed ? (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <Field label="Код">
                <input name="code" required className={controlClass} placeholder="CAB-P19" />
              </Field>
              <Field label="Название">
                <input name="name" required className={controlClass} placeholder="Кабинет LED P1.9" />
              </Field>
              <Field label="Категория">
                <input name="category" required className={controlClass} placeholder="Кабинеты" />
              </Field>
              <Field label="Единица">
                <input name="unit" className={controlClass} defaultValue="шт" />
              </Field>
              <button type="submit" className={buttonClass("primary")}>
                Добавить позицию
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink/60">Добавлять номенклатуру могут склад и менеджер.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
