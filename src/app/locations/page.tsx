"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { createLocation } from "@/lib/services/ledger";
import { listLocations } from "@/lib/services/queries";

export default function LocationsPage() {
  const { db, session, users, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "location.write");
  const rows = listLocations(db);
  const warehouse = users.find((user) => user.role === "warehouse")?.name ?? "";
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("kind") ?? "zone");
    try {
      assertCan(session.role, "location.write");
      if (kind !== "warehouse" && kind !== "zone" && kind !== "bin") throw new Error("kind");
      createLocation(db, { name: String(form.get("name") ?? ""), kind, parentId: String(form.get("parentId") ?? "") || undefined }, session.id);
      refresh();
      event.currentTarget.reset();
      setFlash({ ok: t("locations.added") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("locations.eyebrow")} title={t("locations.title")} description={t("locations.description")} />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-lg border border-line bg-sand">
          <table className="w-full min-w-[560px] text-start text-sm">
            <thead className="bg-paper text-xs tracking-wide text-ink/50 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">{t("locations.name")}</th>
                <th className="px-3 py-2 font-medium">{t("locations.kind")}</th>
                <th className="px-3 py-2 font-medium">{t("locations.inside")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{t(`loc.${row.kind}` as MessageKey)}</td>
                  <td className="px-3 py-2 text-ink/70">{row.parentName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Panel>
          <h2 className="mb-3 font-medium">{t("locations.new")}</h2>
          {allowed ? (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <Field label={t("locations.name")}>
                <input name="name" required className={controlClass} />
              </Field>
              <Field label={t("locations.kind")}>
                <select name="kind" className={controlClass} defaultValue="zone">
                  <option value="warehouse">{t("loc.warehouse")}</option>
                  <option value="zone">{t("loc.zone")}</option>
                  <option value="bin">{t("loc.bin")}</option>
                </select>
              </Field>
              <Field label={t("locations.parent")}>
                <select name="parentId" className={controlClass} defaultValue="">
                  <option value="">{t("common.none")}</option>
                  {rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="submit" className={buttonClass("primary")}>
                {t("locations.add")}
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink/60">{t("locations.switch", { name: warehouse })}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
