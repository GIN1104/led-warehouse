"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { hasMapTarget, mapsLinks, preferredMapUrl } from "@/lib/maps";
import { createLocation, deleteLocation, updateLocation, type LocationKind } from "@/lib/services/ledger";
import { listLocations } from "@/lib/services/queries";

type LocKind = LocationKind;

function parseCoord(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : Number.NaN;
}

export default function LocationsPage() {
  const { db, session, users, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "location.write");
  const rows = listLocations(db);
  const warehouse = users.find((user) => user.role === "warehouse")?.name ?? "";
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  void revision;

  const editing = useMemo(() => rows.find((row) => row.id === editingId) ?? null, [rows, editingId]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("kind") ?? "site");
    try {
      assertCan(session.role, "location.write");
      if (kind !== "warehouse" && kind !== "zone" && kind !== "bin" && kind !== "site") throw new Error("kind");
      const payload = {
        name: String(form.get("name") ?? ""),
        kind: kind as LocKind,
        parentId: String(form.get("parentId") ?? "") || undefined,
        address: String(form.get("address") ?? ""),
        lat: parseCoord(form.get("lat")),
        lng: parseCoord(form.get("lng")),
      };
      if (editingId) {
        updateLocation(db, editingId, payload, session.id);
        setEditingId(null);
        setFlash({ ok: t("locations.updated") });
      } else {
        createLocation(db, payload, session.id);
        setFlash({ ok: t("locations.added") });
      }
      refresh();
      event.currentTarget.reset();
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onDelete(id: string) {
    try {
      assertCan(session.role, "location.write");
      deleteLocation(db, id, session.id);
      if (editingId === id) setEditingId(null);
      refresh();
      setFlash({ ok: t("locations.deleted") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("locations.eyebrow")} title={t("locations.title")} description={t("locations.description")} />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="overflow-x-auto rounded-lg border border-line bg-sand">
          <table className="w-full min-w-[640px] text-start text-sm">
            <thead className="bg-paper text-xs tracking-wide text-ink/50 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">{t("locations.name")}</th>
                <th className="px-3 py-2 font-medium">{t("locations.kind")}</th>
                <th className="px-3 py-2 font-medium">{t("locations.address")}</th>
                <th className="px-3 py-2 font-medium">{t("locations.map")}</th>
                <th className="px-3 py-2 font-medium">{t("locations.inside")}</th>
                {allowed ? <th className="px-3 py-2 font-medium">{t("locations.actions")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const target = { address: row.address, lat: row.lat, lng: row.lng };
                const links = mapsLinks(target);
                const preferred = preferredMapUrl(target);
                return (
                  <tr key={row.id} className="border-t border-line align-top">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{t(`loc.${row.kind}` as MessageKey)}</td>
                    <td className="px-3 py-2 text-ink/80">
                      {row.address?.trim() ||
                        (row.lat != null && row.lng != null ? `${row.lat}, ${row.lng}` : "—")}
                    </td>
                    <td className="px-3 py-2">
                      {preferred && links ? (
                        <div className="flex flex-col gap-1">
                          <a
                            href={preferred}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-copper hover:underline"
                          >
                            {t("locations.openMap")}
                          </a>
                          <span className="text-xs text-ink/45">
                            <a href={links.google} target="_blank" rel="noreferrer" className="hover:underline">
                              Google
                            </a>
                            {" · "}
                            <a href={links.apple} target="_blank" rel="noreferrer" className="hover:underline">
                              Apple
                            </a>
                            {" · "}
                            <a href={links.osm} target="_blank" rel="noreferrer" className="hover:underline">
                              OSM
                            </a>
                          </span>
                        </div>
                      ) : (
                        <span className="text-ink/40">{t("locations.noMap")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink/70">{row.parentName ?? "—"}</td>
                    {allowed ? (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={buttonClass("ghost", "px-2 py-1 text-xs")}
                            onClick={() => {
                              setEditingId(row.id);
                              setFlash({});
                            }}
                          >
                            {t("locations.edit")}
                          </button>
                          <button
                            type="button"
                            className={buttonClass("danger", "px-2 py-1 text-xs")}
                            onClick={() => onDelete(row.id)}
                          >
                            {t("locations.delete")}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Panel>
          <h2 className="mb-1 font-medium">{editing ? t("locations.editTitle") : t("locations.new")}</h2>
          <p className="mb-3 text-xs text-ink/55">{t("locations.formHelp")}</p>
          {allowed ? (
            <form key={editing?.id ?? "new"} onSubmit={onSubmit} className="flex flex-col gap-3">
              <Field label={t("locations.name")}>
                <input name="name" required className={controlClass} defaultValue={editing?.name ?? ""} />
              </Field>
              <Field label={t("locations.kind")}>
                <select name="kind" className={controlClass} defaultValue={editing?.kind ?? "site"}>
                  <option value="warehouse">{t("loc.warehouse")}</option>
                  <option value="zone">{t("loc.zone")}</option>
                  <option value="bin">{t("loc.bin")}</option>
                  <option value="site">{t("loc.site")}</option>
                </select>
              </Field>
              <Field label={t("locations.parent")}>
                <select name="parentId" className={controlClass} defaultValue={editing?.parentId ?? ""}>
                  <option value="">{t("common.none")}</option>
                  {rows
                    .filter((row) => row.id !== editing?.id)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={t("locations.address")}>
                <input
                  name="address"
                  className={controlClass}
                  defaultValue={editing?.address ?? ""}
                  placeholder={t("locations.addressPlaceholder")}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("locations.lat")}>
                  <input
                    name="lat"
                    className={controlClass}
                    inputMode="decimal"
                    defaultValue={editing?.lat ?? ""}
                    placeholder="32.08"
                  />
                </Field>
                <Field label={t("locations.lng")}>
                  <input
                    name="lng"
                    className={controlClass}
                    inputMode="decimal"
                    defaultValue={editing?.lng ?? ""}
                    placeholder="34.78"
                  />
                </Field>
              </div>
              <p className="text-xs text-ink/50">{t("locations.geoHelp")}</p>
              {editing && hasMapTarget(editing) ? (
                <a
                  href={preferredMapUrl(editing) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass("ghost")}
                >
                  {t("locations.openMap")}
                </a>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={buttonClass("primary")}>
                  {editing ? t("locations.save") : t("locations.add")}
                </button>
                {editing ? (
                  <button
                    type="button"
                    className={buttonClass("ghost")}
                    onClick={() => {
                      setEditingId(null);
                      setFlash({});
                    }}
                  >
                    {t("locations.cancelEdit")}
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <p className="text-sm text-ink/60">{t("locations.switch", { name: warehouse })}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
