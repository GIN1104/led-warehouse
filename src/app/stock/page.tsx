"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { EQUIPMENT_STATUSES, EQUIPMENT_TRANSITIONS, type EquipmentStatus } from "@/lib/domain/equipment-status";
import { driveManualHint } from "@/lib/google/drive-sync";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import {
  addSkuVariant,
  createProductFamily,
  listFamilyTree,
  moveFamily,
  moveSkuInFamily,
} from "@/lib/services/catalog-hierarchy";
import {
  addEquipmentItem,
  importEquipmentReserved,
  listEquipmentHistory,
  listEquipmentItems,
  setEquipmentStatus,
  sortEquipmentItems,
  type EquipmentSortKey,
} from "@/lib/services/equipment";
import { applyMovement, type MovementType } from "@/lib/services/ledger";
import { parseMapperFile } from "@/lib/services/mapper-excel";
import { listLocationBalances, listLocations, listMovements, listSkuSummaries } from "@/lib/services/queries";

function statusTone(status: EquipmentStatus): "neutral" | "ok" | "warn" | "alert" {
  if (status === "available") return "ok";
  if (status === "reserved") return "warn";
  if (status === "checked_out") return "neutral";
  return "alert";
}

export default function StockPage() {
  const { db, session, users, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "stock.write");
  const summary = listSkuSummaries(db);
  const balances = listLocationBalances(db);
  const locations = listLocations(db);
  const movements = listMovements(db);
  const warehouse = users.find((user) => user.role === "warehouse")?.name ?? "";
  const drive = driveManualHint();
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<EquipmentSortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [showMovements, setShowMovements] = useState(false);
  const [variantFamilyId, setVariantFamilyId] = useState("");
  void revision;

  const items = useMemo(() => {
    const rows = listEquipmentItems(db, { status: statusFilter, query });
    return sortEquipmentItems(rows, sortKey, sortDir);
  }, [db, statusFilter, query, sortKey, sortDir, revision]);

  const familyTree = useMemo(() => listFamilyTree(db), [db, revision]);
  const realFamilies = familyTree.filter((node) => node.id !== "__uncategorized__");

  const history = historyId ? listEquipmentHistory(db, historyId) : [];

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      assertCan(session.role, "stock.write");
      addEquipmentItem(
        db,
        {
          skuId: String(form.get("skuId") ?? ""),
          qty: Number(form.get("qty")),
          locationId: String(form.get("locationId") ?? "") || undefined,
          note: String(form.get("note") ?? ""),
          status: "available",
          customerName: String(form.get("customerName") ?? ""),
        },
        session.id,
      );
      refresh();
      event.currentTarget.reset();
      setFlash({ ok: t("eq.added") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File) || file.size === 0) return;
    try {
      assertCan(session.role, "stock.write");
      const draft = await parseMapperFile(file);
      const result = importEquipmentReserved(db, draft, session.id);
      refresh();
      setFlash({
        ok: t("eq.importOk", {
          created: result.created,
          updated: result.updated,
          skus: result.skusCreated,
        }),
      });
      event.currentTarget.reset();
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onCreateFamily(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      assertCan(session.role, "stock.write");
      const family = createProductFamily(db, String(form.get("name") ?? ""), session.id);
      refresh();
      setVariantFamilyId(family.id);
      event.currentTarget.reset();
      setFlash({ ok: t("eq.familyCreated") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onAddVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      assertCan(session.role, "stock.write");
      const familyId = String(form.get("familyId") ?? "");
      addSkuVariant(
        db,
        {
          familyId,
          name: String(form.get("name") ?? ""),
          code: String(form.get("code") ?? "") || undefined,
        },
        session.id,
      );
      refresh();
      event.currentTarget.reset();
      setVariantFamilyId(familyId);
      setFlash({ ok: t("eq.variantAdded") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onStatus(itemId: string, to: EquipmentStatus) {
    try {
      assertCan(session.role, "stock.write");
      setEquipmentStatus(db, itemId, to, session.id);
      refresh();
      setFlash({ ok: t("eq.statusChanged") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get("type") ?? "in");
    try {
      assertCan(session.role, "stock.write");
      if (type !== "in" && type !== "out" && type !== "adjust" && type !== "move") {
        throw new Error("type");
      }
      applyMovement(
        db,
        {
          skuId: String(form.get("skuId") ?? ""),
          type: type as MovementType,
          qty: Number(form.get("qty")),
          locationId: String(form.get("locationId") ?? ""),
          fromLocationId: String(form.get("fromLocationId") ?? "") || undefined,
          reason: String(form.get("reason") ?? ""),
        },
        session.id,
      );
      refresh();
      setFlash({ ok: t("stock.posted") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("stock.eyebrow")} title={t("stock.title")} description={t("stock.description")} />
      {!allowed ? <p className="mb-4 text-sm text-ink/60">{t("stock.switch", { name: warehouse })}</p> : null}
      <Flash error={flash.error} ok={flash.ok} />

      <Panel className="mb-4">
        <h2 className="mb-1 font-medium">{t("eq.hierarchyTitle")}</h2>
        <p className="mb-3 text-sm leading-6 text-ink/70">{t("eq.hierarchyHelp")}</p>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row">
          {allowed ? (
            <>
              <form onSubmit={onCreateFamily} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Field label={t("eq.familyName")}>
                    <input name="name" required className={controlClass} placeholder={t("eq.familyPlaceholder")} />
                  </Field>
                </div>
                <button type="submit" className={buttonClass("primary")}>
                  {t("eq.familyCreate")}
                </button>
              </form>
              <form onSubmit={onAddVariant} className="flex flex-[1.4] flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-[8rem]">
                  <Field label={t("eq.family")}>
                    <select
                      name="familyId"
                      className={controlClass}
                      required
                      value={variantFamilyId}
                      onChange={(event) => setVariantFamilyId(event.target.value)}
                    >
                      <option value="">{t("eq.familyPick")}</option>
                      {realFamilies.map((family) => (
                        <option key={family.id} value={family.id}>
                          {family.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label={t("eq.variantName")}>
                    <input name="name" required className={controlClass} placeholder={t("eq.variantPlaceholder")} />
                  </Field>
                </div>
                <div className="min-w-[7rem]">
                  <Field label={t("eq.variantCode")}>
                    <input name="code" className={controlClass} placeholder={t("eq.variantCodeAuto")} />
                  </Field>
                </div>
                <button type="submit" className={buttonClass("primary")}>
                  {t("eq.variantAdd")}
                </button>
              </form>
            </>
          ) : (
            <p className="text-sm text-ink/60">{t("stock.switch", { name: warehouse })}</p>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {familyTree.length === 0 ? (
            <p className="text-sm text-ink/60">{t("eq.hierarchyEmpty")}</p>
          ) : (
            familyTree.map((family) => (
              <div key={family.id} className="rounded-md border border-line bg-paper/60 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{family.name}</h3>
                  {allowed && family.id !== "__uncategorized__" ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className={buttonClass("ghost", "px-2 py-1 text-xs")}
                        onClick={() => {
                          try {
                            assertCan(session.role, "stock.write");
                            moveFamily(db, family.id, "up");
                            refresh();
                          } catch (error) {
                            setFlash({ error: translateError(lang, error) });
                          }
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={buttonClass("ghost", "px-2 py-1 text-xs")}
                        onClick={() => {
                          try {
                            assertCan(session.role, "stock.write");
                            moveFamily(db, family.id, "down");
                            refresh();
                          } catch (error) {
                            setFlash({ error: translateError(lang, error) });
                          }
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  ) : null}
                </div>
                {family.skus.length === 0 ? (
                  <p className="text-xs text-ink/50">{t("eq.hierarchyNoSkus")}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {family.skus.map((sku) => (
                      <li key={sku.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          <span className="me-2 font-mono text-xs text-ink/60">{sku.code}</span>
                          {sku.name}
                        </span>
                        {allowed ? (
                          <span className="flex gap-1">
                            <button
                              type="button"
                              className={buttonClass("ghost", "px-2 py-0.5 text-xs")}
                              onClick={() => {
                                try {
                                  assertCan(session.role, "stock.write");
                                  moveSkuInFamily(db, sku.id, "up");
                                  refresh();
                                } catch (error) {
                                  setFlash({ error: translateError(lang, error) });
                                }
                              }}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className={buttonClass("ghost", "px-2 py-0.5 text-xs")}
                              onClick={() => {
                                try {
                                  assertCan(session.role, "stock.write");
                                  moveSkuInFamily(db, sku.id, "down");
                                  refresh();
                                } catch (error) {
                                  setFlash({ error: translateError(lang, error) });
                                }
                              }}
                            >
                              ↓
                            </button>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      </Panel>

      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-line bg-sand p-3 md:flex-row md:flex-wrap md:items-end">
        <Field label={t("eq.status")}>
          <select
            className={controlClass}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as EquipmentStatus | "all")}
          >
            <option value="all">{t("eq.filterAll")}</option>
            {EQUIPMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`eq.status.${status}` as MessageKey)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("eq.search")}>
          <input className={controlClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("eq.search")} />
        </Field>
        <Field label={t("eq.sort")}>
          <select className={controlClass} value={sortKey} onChange={(event) => setSortKey(event.target.value as EquipmentSortKey)}>
            <option value="code">{t("eq.sort.code")}</option>
            <option value="name">{t("eq.sort.name")}</option>
            <option value="qty">{t("eq.sort.qty")}</option>
            <option value="status">{t("eq.sort.status")}</option>
            <option value="customer">{t("eq.sort.customer")}</option>
            <option value="updated">{t("eq.sort.updated")}</option>
          </select>
        </Field>
        <Field label={t("eq.sort")}>
          <select className={controlClass} value={sortDir} onChange={(event) => setSortDir(event.target.value as "asc" | "desc")}>
            <option value="asc">{t("eq.dir.asc")}</option>
            <option value="desc">{t("eq.dir.desc")}</option>
          </select>
        </Field>
      </div>

      <div className="mb-4 overflow-x-auto rounded-lg border border-line bg-sand">
        <table className="w-full min-w-[960px] text-start text-sm">
          <thead className="bg-paper text-xs tracking-wide text-ink/50 uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">{t("stock.code")}</th>
              <th className="px-3 py-2 font-medium">{t("stock.name")}</th>
              <th className="px-3 py-2 font-medium">{t("stock.qty")}</th>
              <th className="px-3 py-2 font-medium">{t("eq.status")}</th>
              <th className="px-3 py-2 font-medium">{t("eq.customer")}</th>
              <th className="px-3 py-2 font-medium">{t("stock.location")}</th>
              <th className="px-3 py-2 font-medium">{t("eq.updated")}</th>
              <th className="px-3 py-2 font-medium">{t("eq.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-ink/60">
                  {t("eq.empty")}
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const next = EQUIPMENT_TRANSITIONS[row.status];
                return (
                  <tr key={row.id} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-mono text-xs">{row.skuCode}</td>
                    <td className="px-3 py-2">
                      {row.skuName}
                      {row.note ? <p className="text-xs text-ink/50">{row.note}</p> : null}
                    </td>
                    <td className="px-3 py-2">
                      {row.qty} {row.unit}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(row.status)}>{t(`eq.status.${row.status}` as MessageKey)}</Badge>
                    </td>
                    <td className="px-3 py-2">{row.customerName || "—"}</td>
                    <td className="px-3 py-2">{row.locationName || "—"}</td>
                    <td className="px-3 py-2 text-ink/50">{formatDateTime(row.updatedAt)}</td>
                    <td className="px-3 py-2">
                      {allowed ? (
                        <div className="flex flex-wrap gap-1">
                          {next.map((status) => (
                            <button
                              key={status}
                              type="button"
                              className={buttonClass("ghost", "px-2 py-1 text-xs")}
                              onClick={() => onStatus(row.id, status)}
                            >
                              {t(`eq.action.${status}` as MessageKey)}
                            </button>
                          ))}
                          <button
                            type="button"
                            className={buttonClass("ghost", "px-2 py-1 text-xs")}
                            onClick={() => setHistoryId(historyId === row.id ? null : row.id)}
                          >
                            {t("eq.history")}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {historyId ? (
        <Panel className="mb-4">
          <h2 className="mb-2 font-medium">{t("eq.history")}</h2>
          {history.length === 0 ? (
            <p className="text-sm text-ink/60">{t("eq.historyEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {history.map((entry) => (
                <li key={entry.id} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0">
                  <span>
                    {entry.fromStatus ? t(`eq.status.${entry.fromStatus}` as MessageKey) : "—"} →{" "}
                    {t(`eq.status.${entry.toStatus}` as MessageKey)}
                    {entry.note ? <span className="text-ink/50"> — {entry.note}</span> : null}
                  </span>
                  <span className="shrink-0 text-ink/50">{formatDateTime(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-3 font-medium">{t("eq.add")}</h2>
          {allowed ? (
            <form onSubmit={onAdd} className="flex flex-col gap-3">
              <Field label={t("stock.sku")}>
                <select name="skuId" className={controlClass} required>
                  {summary.map((sku) => (
                    <option key={sku.id} value={sku.id}>
                      {sku.code} — {sku.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("stock.qty")}>
                <input name="qty" type="number" required min={1} step={1} className={controlClass} defaultValue={1} />
              </Field>
              <Field label={t("stock.location")}>
                <select name="locationId" className={controlClass} defaultValue="">
                  <option value="">{t("common.notNeeded")}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("eq.customer")}>
                <input name="customerName" className={controlClass} />
              </Field>
              <Field label={t("eq.note")}>
                <input name="note" className={controlClass} />
              </Field>
              <button type="submit" className={buttonClass("primary")}>
                {t("eq.add")}
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink/60">{t("stock.switch", { name: warehouse })}</p>
          )}
        </Panel>

        <Panel>
          <h2 className="mb-2 font-medium">{t("eq.importTitle")}</h2>
          <p className="mb-3 text-sm leading-6 text-ink/70">{t("eq.importHelp", { folder: drive.folder, email: drive.email })}</p>
          {allowed ? (
            <form onSubmit={(event) => void onImport(event)} className="flex flex-col gap-3">
              <Field label={t("eq.importFile")}>
                <input name="file" type="file" accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required className={controlClass} />
              </Field>
              <button type="submit" className={buttonClass("primary")}>
                {t("eq.import")}
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink/60">{t("stock.switch", { name: warehouse })}</p>
          )}
        </Panel>
      </div>

      <div className="mb-3">
        <button type="button" className={buttonClass("ghost")} onClick={() => setShowMovements((value) => !value)}>
          {t("stock.movementsToggle")}
        </button>
      </div>

      {showMovements ? (
        <>
          <h2 className="mb-2 text-sm font-medium text-ink/70">{t("stock.balances")}</h2>
          <div className="mb-4 overflow-x-auto rounded-lg border border-line bg-sand">
            <table className="w-full min-w-[760px] text-start text-sm">
              <thead className="bg-paper text-xs tracking-wide text-ink/50 uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("stock.code")}</th>
                  <th className="px-3 py-2 font-medium">{t("stock.location")}</th>
                  <th className="px-3 py-2 font-medium">{t("stock.onHand")}</th>
                  <th className="px-3 py-2 font-medium">{t("stock.reservedToday")}</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((row) => (
                  <tr key={`${row.skuId}-${row.locationId}`} className="border-t border-line">
                    <td className="px-3 py-2 font-mono text-xs">{row.skuCode}</td>
                    <td className="px-3 py-2">{row.locationName}</td>
                    <td className="px-3 py-2">
                      {row.qtyOnHand} {row.unit}
                    </td>
                    <td className="px-3 py-2">{row.qtyReserved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Panel>
              <h2 className="mb-3 font-medium">{t("stock.post")}</h2>
              {allowed ? (
                <form onSubmit={onMovement} className="flex flex-col gap-3">
                  <Field label={t("stock.type")}>
                    <select name="type" className={controlClass} defaultValue="in">
                      <option value="in">{t("move.in")}</option>
                      <option value="out">{t("move.out")}</option>
                      <option value="adjust">{t("stock.adjustOption")}</option>
                      <option value="move">{t("move.move")}</option>
                    </select>
                  </Field>
                  <Field label={t("stock.sku")}>
                    <select name="skuId" className={controlClass}>
                      {summary.map((sku) => (
                        <option key={sku.id} value={sku.id}>
                          {sku.code} — {sku.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("stock.qty")}>
                    <input name="qty" type="number" required className={controlClass} defaultValue={1} />
                  </Field>
                  <Field label={t("stock.location")}>
                    <select name="locationId" className={controlClass}>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("stock.from")}>
                    <select name="fromLocationId" className={controlClass} defaultValue="">
                      <option value="">{t("common.notNeeded")}</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("stock.reason")}>
                    <input name="reason" className={controlClass} placeholder={t("stock.reasonHint")} />
                  </Field>
                  <button type="submit" className={buttonClass("primary")}>
                    {t("stock.submit")}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-ink/60">{t("stock.switch", { name: warehouse })}</p>
              )}
            </Panel>
            <Panel>
              <h2 className="mb-3 font-medium">{t("stock.recent")}</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {movements.map((movement) => (
                  <li key={movement.id} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0">
                    <span>
                      {t(`move.${movement.type}` as MessageKey)} {movement.skuCode} · {movement.qty} · {movement.locationName}
                      {movement.reason ? <span className="text-ink/50"> — {movement.reason}</span> : null}
                    </span>
                    <span className="shrink-0 text-ink/50">{formatDateTime(movement.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
