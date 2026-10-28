"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, type FormEvent } from "react";
import { EquipmentKitsPanel } from "@/components/equipment-kits";
import { KitSummaryNest } from "@/components/kit-summary-nest";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { EQUIPMENT_STATUSES, EQUIPMENT_TRANSITIONS, type EquipmentStatus } from "@/lib/domain/equipment-status";
import { driveManualHint } from "@/lib/google/drive-sync";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import { orderHref } from "@/lib/paths";
import {
  addSkuVariant,
  assignSkuToFamily,
  createProductFamily,
  deleteProductFamily,
  deleteSku,
  getSkuDeletePreview,
  listFamilyTree,
  listProductFamilies,
  moveFamily,
  moveSkuInFamily,
  renameProductFamily,
  renameSku,
} from "@/lib/services/catalog-hierarchy";
import {
  addEquipmentItem,
  deleteEquipmentItem,
  importEquipmentReserved,
  listEquipmentFamilyAggregates,
  listEquipmentHistory,
  listEquipmentItems,
  setEquipmentSkuBuckets,
  setEquipmentStatus,
  sortEquipmentItems,
  transitionEquipmentQty,
  updateEquipmentItem,
  type EquipmentItemRow,
  type EquipmentSkuAggregate,
  type EquipmentSortKey,
} from "@/lib/services/equipment";
import { listKitSubtypesBySkuId } from "@/lib/services/kits";
import { applyMovement, type MovementType } from "@/lib/services/ledger";
import { parseMapperFile } from "@/lib/services/mapper-excel";
import { listLocationBalances, listLocations, listMovements, listSkuSummaries } from "@/lib/services/queries";

const REPAIR_STATUSES: readonly EquipmentStatus[] = ["needs_repair", "in_repair"];
/** Под sticky-шапкой приложения (h-14) — липнем к viewport, не к карточке. */
const SUMMARY_STICKY_TOP = "top-14";
const qtyInputClass = `${controlClass} h-9 w-14 shrink-0 tabular-nums md:h-10 md:w-20`;
const summaryCellClass = "px-1.5 py-2 align-middle md:px-3";
const mobileQtyLabelClass = "text-[10px] font-medium tracking-wide text-ink/45 uppercase";

function statusTone(status: EquipmentStatus): "neutral" | "ok" | "warn" | "alert" {
  if (status === "available") return "ok";
  if (status === "reserved") return "warn";
  if (status === "checked_out") return "neutral";
  return "alert";
}

function captureSummaryFocus(): { skuId: string; field: string; scrollY: number } | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return { skuId: "", field: "", scrollY: window.scrollY };
  const skuId = active.getAttribute("data-sku-id");
  const field = active.getAttribute("data-field");
  if (!skuId || !field) return { skuId: "", field: "", scrollY: window.scrollY };
  return { skuId, field, scrollY: window.scrollY };
}

function restoreSummaryFocus(snap: { skuId: string; field: string; scrollY: number } | null): void {
  if (!snap) return;
  window.scrollTo(0, snap.scrollY);
  if (!snap.skuId || !snap.field) return;
  const el = document.querySelector<HTMLElement>(
    `[data-sku-id="${CSS.escape(snap.skuId)}"][data-field="${CSS.escape(snap.field)}"]`,
  );
  el?.focus({ preventScroll: true });
}

export default function StockPage() {
  const { db, session, users, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "stock.write", db);
  const summary = listSkuSummaries(db);
  const balances = listLocationBalances(db);
  const locations = listLocations(db);
  const movements = listMovements(db);
  const warehouse =
    users.find((user) => can(user.role, "stock.write", db))?.name ??
    users.find((user) => user.role === "warehouse")?.name ??
    "";
  const drive = driveManualHint();
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<EquipmentSortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [showMovements, setShowMovements] = useState(false);
  const [variantFamilyId, setVariantFamilyId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { qty: string; name: string }>>({});
  const [repairDraft, setRepairDraft] = useState<{ itemId: string; to: EquipmentStatus; qty: string } | null>(null);
  const [bucketDrafts, setBucketDrafts] = useState<
    Record<string, { total: string; onHand: string; inUse: string; inRepair: string }>
  >({});
  const [familyNameDrafts, setFamilyNameDrafts] = useState<Record<string, string>>({});
  const [skuNameDrafts, setSkuNameDrafts] = useState<Record<string, string>>({});
  const [addDrafts, setAddDrafts] = useState<Record<string, string>>({});
  const [addingFamilyId, setAddingFamilyId] = useState<string | null>(null);
  const [editingGroupSkuId, setEditingGroupSkuId] = useState<string | null>(null);
  void revision;

  const items = useMemo(() => {
    const rows = listEquipmentItems(db, { status: statusFilter, query });
    return sortEquipmentItems(rows, sortKey, sortDir);
  }, [db, statusFilter, query, sortKey, sortDir, revision]);

  const familyAggregates = useMemo(() => listEquipmentFamilyAggregates(db, { query }), [db, query, revision]);
  const kitBySku = useMemo(() => listKitSubtypesBySkuId(db), [db, revision]);

  const familyTree = useMemo(() => listFamilyTree(db), [db, revision]);
  const realFamilies = familyTree.filter((node) => node.id !== "__uncategorized__");

  const history = historyId ? listEquipmentHistory(db, historyId) : [];

  function draftFor(row: EquipmentItemRow) {
    return drafts[row.id] ?? { qty: String(row.qty), name: row.skuName };
  }

  function bucketDraftFor(agg: EquipmentSkuAggregate) {
    return (
      bucketDrafts[agg.skuId] ?? {
        total: String(agg.total),
        onHand: String(agg.onHand),
        inUse: String(agg.inUse),
        inRepair: String(agg.inRepair),
      }
    );
  }

  function setBucketDraft(
    agg: EquipmentSkuAggregate,
    patch: Partial<{ total: string; onHand: string; inUse: string; inRepair: string }>,
  ) {
    setBucketDrafts((prev) => ({
      ...prev,
      [agg.skuId]: {
        total: prev[agg.skuId]?.total ?? String(agg.total),
        onHand: prev[agg.skuId]?.onHand ?? String(agg.onHand),
        inUse: prev[agg.skuId]?.inUse ?? String(agg.inUse),
        inRepair: prev[agg.skuId]?.inRepair ?? String(agg.inRepair),
        ...patch,
      },
    }));
  }

  async function saveBuckets(agg: EquipmentSkuAggregate, draftOverride?: Partial<{ total: string; onHand: string; inUse: string; inRepair: string }>) {
    const draft = { ...bucketDraftFor(agg), ...draftOverride };
    const inUse = Number(draft.inUse);
    const inRepair = Number(draft.inRepair);
    let onHand = Number(draft.onHand);
    const total = Number(draft.total);

    // Если меняли «всего» — пересчитываем склад: всего = склад + работа + ремонт
    if (draftOverride?.total !== undefined && draftOverride.onHand === undefined) {
      onHand = total - inUse - inRepair;
      if (onHand < 0) {
        setFlash({ error: t("eq.summaryTotalLow") });
        setBucketDrafts((prev) => ({
          ...prev,
          [agg.skuId]: {
            total: String(agg.total),
            onHand: String(agg.onHand),
            inUse: String(agg.inUse),
            inRepair: String(agg.inRepair),
          },
        }));
        return;
      }
    } else if (draftOverride?.onHand !== undefined || draftOverride?.inUse !== undefined || draftOverride?.inRepair !== undefined) {
      // Корзины заданы явно — всего = сумма
      onHand = Number(draft.onHand);
    }

    if (
      onHand === agg.onHand &&
      inUse === agg.inUse &&
      inRepair === agg.inRepair &&
      onHand + inUse + inRepair === agg.total
    ) {
      setBucketDrafts((prev) => {
        if (!prev[agg.skuId]) return prev;
        const next = { ...prev };
        delete next[agg.skuId];
        return next;
      });
      return;
    }

    const focusSnap = captureSummaryFocus();
    try {
      assertCan(session.role, "stock.write", db);
      setEquipmentSkuBuckets(db, agg.skuId, { onHand, inUse, inRepair }, session.id);
      setBucketDrafts((prev) => {
        const next = { ...prev };
        delete next[agg.skuId];
        return next;
      });
      // Без flash ok — иначе шапка Flash сдвигает таблицу при каждом qty.
      await refresh();
      requestAnimationFrame(() => restoreSummaryFocus(focusSnap));
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
      setBucketDrafts((prev) => ({
        ...prev,
        [agg.skuId]: {
          total: String(agg.total),
          onHand: String(agg.onHand),
          inUse: String(agg.inUse),
          inRepair: String(agg.inRepair),
        },
      }));
      requestAnimationFrame(() => restoreSummaryFocus(focusSnap));
    }
  }

  function setDraft(id: string, patch: Partial<{ qty: string; name: string }>, row: EquipmentItemRow) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { qty: prev[id]?.qty ?? String(row.qty), name: prev[id]?.name ?? row.skuName, ...patch },
    }));
  }

  async function saveRow(row: EquipmentItemRow, patch?: { qty?: string; name?: string }) {
    const draft = {
      qty: patch?.qty ?? drafts[row.id]?.qty ?? String(row.qty),
      name: patch?.name ?? drafts[row.id]?.name ?? row.skuName,
    };
    const nextQty = Number(draft.qty);
    const nameChanged = draft.name.trim() !== row.skuName;
    const qtyChanged = Number.isFinite(nextQty) && nextQty !== row.qty;
    if (!nameChanged && !qtyChanged) {
      setDrafts((prev) => {
        if (!prev[row.id]) return prev;
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return;
    }
    try {
      assertCan(session.role, "stock.write", db);
      updateEquipmentItem(
        db,
        row.id,
        {
          qty: qtyChanged ? nextQty : undefined,
          skuName: nameChanged ? draft.name : undefined,
        },
        session.id,
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await refresh();
      setFlash({ ok: t("eq.saved") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
      setDrafts((prev) => ({ ...prev, [row.id]: { qty: String(row.qty), name: row.skuName } }));
    }
  }

  async function onDelete(row: EquipmentItemRow) {
    if (!window.confirm(t("eq.deleteConfirm"))) return;
    try {
      assertCan(session.role, "stock.write", db);
      deleteEquipmentItem(db, row.id, session.id);
      if (historyId === row.id) setHistoryId(null);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await refresh();
      setFlash({ ok: t("eq.deleted") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      assertCan(session.role, "stock.write", db);
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
      void refresh().then(() => setFlash({ ok: t("eq.added") }));
      event.currentTarget.reset();
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File) || file.size === 0) return;
    try {
      assertCan(session.role, "stock.write", db);
      const draft = await parseMapperFile(file);
      const result = importEquipmentReserved(db, draft, session.id);
      await refresh();
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
      assertCan(session.role, "stock.write", db);
      const family = createProductFamily(db, String(form.get("name") ?? ""), session.id);
      void refresh().then(() => {
        setVariantFamilyId(family.id);
        setFlash({ ok: t("eq.familyCreated") });
      });
      event.currentTarget.reset();
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onAddVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      assertCan(session.role, "stock.write", db);
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
      void refresh().then(() => {
        setVariantFamilyId(familyId);
        setFlash({ ok: t("eq.variantAdded") });
      });
      event.currentTarget.reset();
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onStatus(itemId: string, to: EquipmentStatus) {
    const row = items.find((item) => item.id === itemId);
    if (REPAIR_STATUSES.includes(to) && row && row.qty > 1) {
      setRepairDraft({ itemId, to, qty: "1" });
      return;
    }
    try {
      assertCan(session.role, "stock.write", db);
      setEquipmentStatus(db, itemId, to, session.id);
      setRepairDraft(null);
      void refresh().then(() => setFlash({ ok: t("eq.statusChanged") }));
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onRepairApply() {
    if (!repairDraft) return;
    const row = items.find((item) => item.id === repairDraft.itemId);
    if (!row) {
      setRepairDraft(null);
      return;
    }
    try {
      assertCan(session.role, "stock.write", db);
      const qty = Number(repairDraft.qty);
      const result = transitionEquipmentQty(db, repairDraft.itemId, repairDraft.to, qty, session.id);
      setRepairDraft(null);
      void refresh().then(() => {
        setFlash({
          ok: result.split
            ? t("eq.partialOk", { moved: result.moved.qty, remain: result.source.qty })
            : t("eq.statusChanged"),
        });
      });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onReorderFamily(familyId: string, direction: "up" | "down") {
    if (familyId === "__uncategorized__") return;
    try {
      assertCan(session.role, "stock.write", db);
      moveFamily(db, familyId, direction);
      void refresh().then(() => setFlash({ ok: t("eq.orderSaved") }));
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onReorderSku(skuId: string, direction: "up" | "down") {
    try {
      assertCan(session.role, "stock.write", db);
      moveSkuInFamily(db, skuId, direction);
      void refresh().then(() => setFlash({ ok: t("eq.orderSaved") }));
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  const movableFamilies = familyAggregates.filter((family) => family.familyId !== "__uncategorized__");
  const productFamilies = useMemo(() => listProductFamilies(db), [db, revision]);

  async function saveFamilyName(familyId: string, name: string, currentName: string) {
    if (familyId === "__uncategorized__") return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      setFamilyNameDrafts((prev) => {
        if (!prev[familyId]) return prev;
        const next = { ...prev };
        delete next[familyId];
        return next;
      });
      return;
    }
    try {
      assertCan(session.role, "stock.write", db);
      renameProductFamily(db, familyId, trimmed, session.id);
      setFamilyNameDrafts((prev) => {
        const next = { ...prev };
        delete next[familyId];
        return next;
      });
      await refresh();
      setFlash({ ok: t("eq.familyRenamed") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
      setFamilyNameDrafts((prev) => ({ ...prev, [familyId]: currentName }));
    }
  }

  async function saveSkuName(skuId: string, name: string, currentName: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      setSkuNameDrafts((prev) => {
        if (!prev[skuId]) return prev;
        const next = { ...prev };
        delete next[skuId];
        return next;
      });
      return;
    }
    try {
      assertCan(session.role, "stock.write", db);
      renameSku(db, skuId, trimmed, session.id);
      setSkuNameDrafts((prev) => {
        const next = { ...prev };
        delete next[skuId];
        return next;
      });
      await refresh();
      setFlash({ ok: t("eq.skuRenamed") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
      setSkuNameDrafts((prev) => ({ ...prev, [skuId]: currentName }));
    }
  }

  async function onAssignFamily(skuId: string, familyId: string) {
    try {
      assertCan(session.role, "stock.write", db);
      assignSkuToFamily(db, skuId, familyId || null, session.id);
      setEditingGroupSkuId(null);
      await refresh();
      setFlash({ ok: t("eq.skuMoved") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onAddInFamily(familyId: string) {
    if (familyId === "__uncategorized__") return;
    const name = (addDrafts[familyId] ?? "").trim();
    if (!name) {
      setFlash({ error: t("err.name") });
      return;
    }
    try {
      assertCan(session.role, "stock.write", db);
      addSkuVariant(db, { familyId, name }, session.id);
      setAddDrafts((prev) => {
        const next = { ...prev };
        delete next[familyId];
        return next;
      });
      setAddingFamilyId(null);
      await refresh();
      setFlash({ ok: t("eq.variantAdded") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onDeleteSku(skuId: string, skuName: string) {
    try {
      assertCan(session.role, "stock.write", db);
      const preview = getSkuDeletePreview(db, skuId);
      if (preview.inOrders) {
        window.alert(t("eq.deleteSkuInOrders", { name: skuName, count: preview.orderLineCount }));
        return;
      }
      const qtyHint =
        preview.equipmentQty > 0 ? t("eq.deleteSkuQtyHint", { qty: preview.equipmentQty }) : "";
      if (!window.confirm(`${t("eq.deleteSkuConfirm", { name: skuName })}${qtyHint ? `\n${qtyHint}` : ""}`)) {
        return;
      }
      deleteSku(db, skuId, session.id);
      await refresh();
      setFlash({ ok: t("eq.skuDeleted") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onDeleteEmptyFamily(familyId: string, familyName: string) {
    if (familyId === "__uncategorized__") return;
    if (!window.confirm(t("eq.deleteFamilyConfirm", { name: familyName }))) return;
    try {
      assertCan(session.role, "stock.write", db);
      deleteProductFamily(db, familyId, session.id);
      await refresh();
      setFlash({ ok: t("eq.familyDeleted") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  function onMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get("type") ?? "in");
    try {
      assertCan(session.role, "stock.write", db);
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
      void refresh().then(() => setFlash({ ok: t("stock.posted") }));
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("stock.eyebrow")} title={t("stock.title")} description={t("stock.description")} />
      {!allowed ? (
        <div className="mb-4 rounded-md border border-line bg-sand/70 px-3 py-2 text-sm text-ink/70">
          <p className="font-medium text-ink/80">{t("stock.viewOnly")}</p>
          <p className="mt-1">{t("stock.viewOnlyHint", { name: warehouse || "—" })}</p>
        </div>
      ) : null}
      <Flash error={flash.error} ok={flash.ok} />

      <Panel className="mb-4 max-md:px-3 max-md:py-3">
        <h2 className="mb-1 font-medium">{t("eq.summaryTitle")}</h2>
        <p className="mb-3 text-sm leading-6 text-ink/70">{t("eq.summaryHelp")}</p>
        {familyAggregates.length === 0 ? (
          <p className="text-sm text-ink/60">{t("eq.summaryEmpty")}</p>
        ) : (
          <>
          {/* Mobile: карточки без горизонтального overflow страницы */}
          <div className="space-y-3 md:hidden">
            {familyAggregates.map((family) => {
              const familyIndex = movableFamilies.findIndex((row) => row.familyId === family.familyId);
              const canMoveFamily = family.familyId !== "__uncategorized__" && allowed;
              return (
                <section key={family.familyId} className="overflow-hidden rounded-md border border-line bg-paper/70">
                  <div className="flex items-start gap-2 border-b border-line bg-sand/80 px-2.5 py-2">
                    {canMoveFamily ? (
                      <span className="inline-flex shrink-0 flex-col gap-0.5 pt-0.5">
                        <button
                          type="button"
                          className={buttonClass("ghost", "size-8 px-0 text-xs")}
                          disabled={familyIndex <= 0}
                          aria-label={t("eq.moveUp")}
                          onClick={() => onReorderFamily(family.familyId, "up")}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={buttonClass("ghost", "size-8 px-0 text-xs")}
                          disabled={familyIndex < 0 || familyIndex >= movableFamilies.length - 1}
                          aria-label={t("eq.moveDown")}
                          onClick={() => onReorderFamily(family.familyId, "down")}
                        >
                          ↓
                        </button>
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-1">
                      {canMoveFamily ? (
                        <input
                          className={`${controlClass} h-9 w-full font-medium`}
                          value={familyNameDrafts[family.familyId] ?? family.familyName}
                          aria-label={t("eq.familyName")}
                          onChange={(event) =>
                            setFamilyNameDrafts((prev) => ({ ...prev, [family.familyId]: event.target.value }))
                          }
                          onBlur={(event) => void saveFamilyName(family.familyId, event.target.value, family.familyName)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              (event.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      ) : (
                        <p className="truncate font-medium">{family.familyName}</p>
                      )}
                      <p className="text-xs text-ink/50">
                        {t("eq.summaryGroupTotal")}: {family.total}
                        {" · "}
                        {t("eq.summaryOnHand")} {family.onHand}
                        {" · "}
                        {t("eq.summaryInUse")} {family.inUse}
                        {" · "}
                        {t("eq.summaryInRepair")} {family.inRepair}
                      </p>
                    </div>
                  </div>

                  {canMoveFamily ? (
                    <div className="flex flex-wrap items-center gap-1 border-b border-line px-2.5 py-2">
                      {addingFamilyId === family.familyId ? (
                        <>
                          <input
                            className={`${controlClass} h-9 min-w-0 flex-1`}
                            value={addDrafts[family.familyId] ?? ""}
                            placeholder={t("eq.variantPlaceholder")}
                            aria-label={t("eq.variantName")}
                            autoFocus
                            onChange={(event) =>
                              setAddDrafts((prev) => ({ ...prev, [family.familyId]: event.target.value }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void onAddInFamily(family.familyId);
                              }
                              if (event.key === "Escape") setAddingFamilyId(null);
                            }}
                          />
                          <button
                            type="button"
                            className={buttonClass("primary", "h-9 px-2 text-xs")}
                            onClick={() => void onAddInFamily(family.familyId)}
                          >
                            {t("eq.addInGroup")}
                          </button>
                          <button
                            type="button"
                            className={buttonClass("ghost", "h-9 px-2 text-xs")}
                            onClick={() => setAddingFamilyId(null)}
                          >
                            {t("eq.repairCancel")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={buttonClass("ghost", "h-9 px-2 text-xs")}
                          onClick={() => setAddingFamilyId(family.familyId)}
                        >
                          {t("eq.addInGroup")}
                        </button>
                      )}
                      {family.skus.length === 0 ? (
                        <button
                          type="button"
                          className={buttonClass("danger", "h-9 px-2 text-xs")}
                          onClick={() => void onDeleteEmptyFamily(family.familyId, family.familyName)}
                        >
                          {t("eq.deleteFamily")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {family.skus.length === 0 ? (
                    <p className="px-2.5 py-3 text-xs text-ink/50">{t("eq.summaryNoVariants")}</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {family.skus.map((agg, skuIndex) => {
                        const draft = bucketDraftFor(agg);
                        const kitNest = kitBySku.get(agg.skuId);
                        return (
                          <li key={agg.skuId} className="px-2.5 py-3">
                            <div className="flex items-start gap-2">
                              {allowed ? (
                                <span className="inline-flex shrink-0 flex-col gap-0.5">
                                  <button
                                    type="button"
                                    className={buttonClass("ghost", "size-8 px-0 text-xs")}
                                    disabled={skuIndex <= 0}
                                    aria-label={t("eq.moveUp")}
                                    onClick={() => onReorderSku(agg.skuId, "up")}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className={buttonClass("ghost", "size-8 px-0 text-xs")}
                                    disabled={skuIndex >= family.skus.length - 1}
                                    aria-label={t("eq.moveDown")}
                                    onClick={() => onReorderSku(agg.skuId, "down")}
                                  >
                                    ↓
                                  </button>
                                </span>
                              ) : null}
                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="font-mono text-[11px] text-ink/45">{agg.skuCode}</span>
                                  {allowed ? (
                                    <button
                                      type="button"
                                      className={buttonClass("danger", "ms-auto h-8 px-2 text-xs")}
                                      onClick={() => void onDeleteSku(agg.skuId, agg.skuName)}
                                    >
                                      {t("eq.delete")}
                                    </button>
                                  ) : null}
                                </div>
                                {allowed ? (
                                  <div className="flex min-w-0 flex-col gap-1.5">
                                    <input
                                      className={`${controlClass} h-9 w-full`}
                                      value={skuNameDrafts[agg.skuId] ?? agg.skuName}
                                      aria-label={t("stock.name")}
                                      onChange={(event) =>
                                        setSkuNameDrafts((prev) => ({ ...prev, [agg.skuId]: event.target.value }))
                                      }
                                      onBlur={(event) => void saveSkuName(agg.skuId, event.target.value, agg.skuName)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault();
                                          (event.target as HTMLInputElement).blur();
                                        }
                                      }}
                                    />
                                    {editingGroupSkuId === agg.skuId ? (
                                      <div className="flex flex-wrap gap-1">
                                        <select
                                          className={`${controlClass} h-9 min-w-0 flex-1 py-0 text-xs`}
                                          value={agg.familyId ?? ""}
                                          aria-label={t("eq.summaryAssignGroup")}
                                          autoFocus
                                          onChange={(event) => void onAssignFamily(agg.skuId, event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === "Escape") setEditingGroupSkuId(null);
                                          }}
                                        >
                                          <option value="">{t("eq.uncategorized")}</option>
                                          {productFamilies.map((item) => (
                                            <option key={item.id} value={item.id}>
                                              {item.name}
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          type="button"
                                          className={buttonClass("ghost", "h-9 px-2 text-xs")}
                                          onClick={() => setEditingGroupSkuId(null)}
                                        >
                                          {t("eq.repairCancel")}
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        className={buttonClass("ghost", "h-8 w-fit px-2 text-xs text-ink/60")}
                                        onClick={() => setEditingGroupSkuId(agg.skuId)}
                                      >
                                        {t("eq.editGroup")}
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <p className="font-medium">{agg.skuName}</p>
                                )}

                                <div className="grid grid-cols-2 gap-2">
                                  <label className="flex flex-col gap-1">
                                    <span className={mobileQtyLabelClass}>{t("eq.summaryTotal")}</span>
                                    {allowed ? (
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        className={`${qtyInputClass} w-full max-w-none`}
                                        data-sku-id={agg.skuId}
                                        data-field="total"
                                        value={draft.total}
                                        aria-label={t("eq.summaryTotal")}
                                        onChange={(event) => setBucketDraft(agg, { total: event.target.value })}
                                        onBlur={(event) => void saveBuckets(agg, { total: event.target.value })}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            (event.target as HTMLInputElement).blur();
                                          }
                                        }}
                                      />
                                    ) : (
                                      <span className="text-sm tabular-nums">{agg.total}</span>
                                    )}
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className={mobileQtyLabelClass}>{t("eq.summaryOnHand")}</span>
                                    {allowed ? (
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        className={`${qtyInputClass} w-full max-w-none`}
                                        data-sku-id={agg.skuId}
                                        data-field="onHand"
                                        value={draft.onHand}
                                        aria-label={t("eq.summaryOnHand")}
                                        onChange={(event) => {
                                          const onHand = event.target.value;
                                          const inUse = Number(draft.inUse) || 0;
                                          const inRepair = Number(draft.inRepair) || 0;
                                          setBucketDraft(agg, {
                                            onHand,
                                            total: String((Number(onHand) || 0) + inUse + inRepair),
                                          });
                                        }}
                                        onBlur={(event) => void saveBuckets(agg, { onHand: event.target.value })}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            (event.target as HTMLInputElement).blur();
                                          }
                                        }}
                                      />
                                    ) : (
                                      <Badge tone="ok">{agg.onHand}</Badge>
                                    )}
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className={mobileQtyLabelClass}>{t("eq.summaryInUse")}</span>
                                    {allowed ? (
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        className={`${qtyInputClass} w-full max-w-none`}
                                        data-sku-id={agg.skuId}
                                        data-field="inUse"
                                        value={draft.inUse}
                                        aria-label={t("eq.summaryInUse")}
                                        onChange={(event) => {
                                          const inUse = event.target.value;
                                          const onHand = Number(draft.onHand) || 0;
                                          const inRepair = Number(draft.inRepair) || 0;
                                          setBucketDraft(agg, {
                                            inUse,
                                            total: String(onHand + (Number(inUse) || 0) + inRepair),
                                          });
                                        }}
                                        onBlur={(event) => void saveBuckets(agg, { inUse: event.target.value })}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            (event.target as HTMLInputElement).blur();
                                          }
                                        }}
                                      />
                                    ) : (
                                      <Badge tone={agg.inUse > 0 ? "warn" : "neutral"}>{agg.inUse}</Badge>
                                    )}
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className={mobileQtyLabelClass}>{t("eq.summaryInRepair")}</span>
                                    {allowed ? (
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        className={`${qtyInputClass} w-full max-w-none`}
                                        data-sku-id={agg.skuId}
                                        data-field="inRepair"
                                        value={draft.inRepair}
                                        aria-label={t("eq.summaryInRepair")}
                                        onChange={(event) => {
                                          const inRepair = event.target.value;
                                          const onHand = Number(draft.onHand) || 0;
                                          const inUse = Number(draft.inUse) || 0;
                                          setBucketDraft(agg, {
                                            inRepair,
                                            total: String(onHand + inUse + (Number(inRepair) || 0)),
                                          });
                                        }}
                                        onBlur={(event) => void saveBuckets(agg, { inRepair: event.target.value })}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            (event.target as HTMLInputElement).blur();
                                          }
                                        }}
                                      />
                                    ) : (
                                      <Badge tone={agg.inRepair > 0 ? "alert" : "neutral"}>{agg.inRepair}</Badge>
                                    )}
                                  </label>
                                </div>

                                {agg.deployments.length > 0 ? (
                                  <ul className="space-y-1 text-xs leading-5 text-ink/70">
                                    {agg.deployments.map((dep) => (
                                      <li key={dep.itemId} className="break-words">
                                        {dep.qty} {agg.unit}
                                        {" · "}
                                        {t(`eq.status.${dep.status}` as MessageKey)}
                                        {" · "}
                                        {dep.orderId ? (
                                          <Link href={orderHref(dep.orderId)} className="text-copper hover:underline">
                                            {dep.label || t("eq.openOrder")}
                                          </Link>
                                        ) : (
                                          <span>{dep.label}</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}

                                {kitNest ? (
                                  <div className="-mx-1 overflow-x-auto">
                                    <table className="w-full min-w-0 text-start text-sm">
                                      <tbody>
                                        <KitSummaryNest
                                          db={db}
                                          subtype={kitNest}
                                          allowed={allowed}
                                          refresh={refresh}
                                          onFlash={setFlash}
                                        />
                                      </tbody>
                                    </table>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>

          {/* Desktop: прежняя sticky-таблица */}
          <div className="hidden rounded-md border border-line bg-paper/60 md:block">
            <table className="w-full table-fixed text-start text-sm">
              <colgroup>
                <col className="w-[5.5rem]" />
                <col className="w-[7rem]" />
                <col />
                <col className="w-[6.5rem]" />
                <col className="w-[6.5rem]" />
                <col className="w-[6.5rem]" />
                <col className="w-[6.5rem]" />
                <col className="w-[11rem]" />
              </colgroup>
              <thead
                className={`sticky ${SUMMARY_STICKY_TOP} z-20 text-xs tracking-wide text-ink/50 uppercase shadow-[0_1px_0_0_var(--color-line,rgba(0,0,0,0.08))]`}
              >
                <tr>
                  <th className="bg-sand px-3 py-2.5 font-medium">{t("eq.summaryOrder")}</th>
                  <th className="bg-sand px-3 py-2.5 font-medium">{t("stock.code")}</th>
                  <th className="bg-sand px-3 py-2.5 font-medium">{t("stock.name")}</th>
                  <th className="bg-sand px-3 py-2.5 font-medium">{t("eq.summaryTotal")}</th>
                  <th className="bg-sand px-3 py-2.5 font-medium">{t("eq.summaryOnHand")}</th>
                  <th className="bg-sand px-3 py-2.5 font-medium">{t("eq.summaryInUse")}</th>
                  <th className="bg-sand px-3 py-2.5 font-medium">{t("eq.summaryInRepair")}</th>
                  <th className="bg-sand px-3 py-2.5 font-medium">{t("eq.summaryDeployments")}</th>
                </tr>
              </thead>
              <tbody>
                {familyAggregates.map((family) => {
                  const familyIndex = movableFamilies.findIndex((row) => row.familyId === family.familyId);
                  const canMoveFamily = family.familyId !== "__uncategorized__" && allowed;
                  return (
                  <Fragment key={family.familyId}>
                    <tr className="border-t border-line bg-sand/80">
                      <td className={summaryCellClass}>
                        {canMoveFamily ? (
                          <span className="inline-flex h-10 items-center gap-1">
                            <button
                              type="button"
                              className={buttonClass("ghost", "px-2 py-0.5 text-xs")}
                              disabled={familyIndex <= 0}
                              aria-label={t("eq.moveUp")}
                              title={t("eq.moveUp")}
                              onClick={() => onReorderFamily(family.familyId, "up")}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className={buttonClass("ghost", "px-2 py-0.5 text-xs")}
                              disabled={familyIndex < 0 || familyIndex >= movableFamilies.length - 1}
                              aria-label={t("eq.moveDown")}
                              title={t("eq.moveDown")}
                              onClick={() => onReorderFamily(family.familyId, "down")}
                            >
                              ↓
                            </button>
                          </span>
                        ) : null}
                      </td>
                      <td colSpan={2} className={`${summaryCellClass} font-medium`}>
                        <div className="flex min-w-0 items-center gap-2">
                          {canMoveFamily ? (
                            <input
                              className={`${controlClass} h-10 min-w-[10rem] flex-1 font-medium`}
                              value={familyNameDrafts[family.familyId] ?? family.familyName}
                              aria-label={t("eq.familyName")}
                              onChange={(event) =>
                                setFamilyNameDrafts((prev) => ({ ...prev, [family.familyId]: event.target.value }))
                              }
                              onBlur={(event) => void saveFamilyName(family.familyId, event.target.value, family.familyName)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  (event.target as HTMLInputElement).blur();
                                }
                              }}
                            />
                          ) : (
                            <span className="truncate">{family.familyName}</span>
                          )}
                          <span className="shrink-0 text-xs font-normal whitespace-nowrap text-ink/50">
                            {t("eq.summaryGroupTotal")}: {family.total}
                          </span>
                        </div>
                      </td>
                      <td className={`${summaryCellClass} text-xs tabular-nums text-ink/60`}>{family.total}</td>
                      <td className={`${summaryCellClass} text-xs tabular-nums text-ink/60`}>{family.onHand}</td>
                      <td className={`${summaryCellClass} text-xs tabular-nums text-ink/60`}>{family.inUse}</td>
                      <td className={`${summaryCellClass} text-xs tabular-nums text-ink/60`}>{family.inRepair}</td>
                      <td className={summaryCellClass}>
                        {canMoveFamily ? (
                          <div className="flex h-10 flex-wrap items-center gap-1">
                            {addingFamilyId === family.familyId ? (
                              <>
                                <input
                                  className={`${controlClass} h-10 min-w-[8rem]`}
                                  value={addDrafts[family.familyId] ?? ""}
                                  placeholder={t("eq.variantPlaceholder")}
                                  aria-label={t("eq.variantName")}
                                  autoFocus
                                  onChange={(event) =>
                                    setAddDrafts((prev) => ({ ...prev, [family.familyId]: event.target.value }))
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void onAddInFamily(family.familyId);
                                    }
                                    if (event.key === "Escape") setAddingFamilyId(null);
                                  }}
                                />
                                <button
                                  type="button"
                                  className={buttonClass("primary", "h-10 px-2 text-xs")}
                                  onClick={() => void onAddInFamily(family.familyId)}
                                >
                                  {t("eq.addInGroup")}
                                </button>
                                <button
                                  type="button"
                                  className={buttonClass("ghost", "h-10 px-2 text-xs")}
                                  onClick={() => setAddingFamilyId(null)}
                                >
                                  {t("eq.repairCancel")}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className={buttonClass("ghost", "h-10 px-2 text-xs")}
                                onClick={() => setAddingFamilyId(family.familyId)}
                              >
                                {t("eq.addInGroup")}
                              </button>
                            )}
                            {family.skus.length === 0 ? (
                              <button
                                type="button"
                                className={buttonClass("danger", "h-10 px-2 text-xs")}
                                onClick={() => void onDeleteEmptyFamily(family.familyId, family.familyName)}
                              >
                                {t("eq.deleteFamily")}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                    {family.skus.length === 0 ? (
                      <tr className="border-t border-line">
                        <td colSpan={8} className="px-3 py-2 ps-8 text-xs text-ink/50">
                          {t("eq.summaryNoVariants")}
                        </td>
                      </tr>
                    ) : (
                      family.skus.map((agg, skuIndex) => {
                        const draft = bucketDraftFor(agg);
                        const kitNest = kitBySku.get(agg.skuId);
                        return (
                          <Fragment key={agg.skuId}>
                          <tr className="border-t border-line align-middle">
                            <td className={summaryCellClass}>
                              {allowed ? (
                                <span className="inline-flex h-10 items-center gap-1 ps-4">
                                  <button
                                    type="button"
                                    className={buttonClass("ghost", "px-2 py-0.5 text-xs")}
                                    disabled={skuIndex <= 0}
                                    aria-label={t("eq.moveUp")}
                                    title={t("eq.moveUp")}
                                    onClick={() => onReorderSku(agg.skuId, "up")}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className={buttonClass("ghost", "px-2 py-0.5 text-xs")}
                                    disabled={skuIndex >= family.skus.length - 1}
                                    aria-label={t("eq.moveDown")}
                                    title={t("eq.moveDown")}
                                    onClick={() => onReorderSku(agg.skuId, "down")}
                                  >
                                    ↓
                                  </button>
                                </span>
                              ) : null}
                            </td>
                            <td className={`${summaryCellClass} ps-4 font-mono text-xs tabular-nums`}>{agg.skuCode}</td>
                            <td className={summaryCellClass}>
                              {allowed ? (
                                <div className="flex h-10 min-w-0 items-center gap-2">
                                  <input
                                    className={`${controlClass} h-10 min-w-0 flex-1`}
                                    value={skuNameDrafts[agg.skuId] ?? agg.skuName}
                                    aria-label={t("stock.name")}
                                    onChange={(event) =>
                                      setSkuNameDrafts((prev) => ({ ...prev, [agg.skuId]: event.target.value }))
                                    }
                                    onBlur={(event) => void saveSkuName(agg.skuId, event.target.value, agg.skuName)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        (event.target as HTMLInputElement).blur();
                                      }
                                    }}
                                  />
                                  {editingGroupSkuId === agg.skuId ? (
                                    <>
                                      <select
                                        className={`${controlClass} h-10 w-auto min-w-[7rem] shrink-0 py-0 text-xs`}
                                        value={agg.familyId ?? ""}
                                        aria-label={t("eq.summaryAssignGroup")}
                                        autoFocus
                                        onChange={(event) => void onAssignFamily(agg.skuId, event.target.value)}
                                        onKeyDown={(event) => {
                                          if (event.key === "Escape") setEditingGroupSkuId(null);
                                        }}
                                      >
                                        <option value="">{t("eq.uncategorized")}</option>
                                        {productFamilies.map((item) => (
                                          <option key={item.id} value={item.id}>
                                            {item.name}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        className={buttonClass("ghost", "h-10 shrink-0 px-2 text-xs")}
                                        onClick={() => setEditingGroupSkuId(null)}
                                      >
                                        {t("eq.repairCancel")}
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className={buttonClass("ghost", "h-10 shrink-0 px-2 text-xs text-ink/60")}
                                      onClick={() => setEditingGroupSkuId(agg.skuId)}
                                    >
                                      {t("eq.editGroup")}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="line-clamp-1">{agg.skuName}</span>
                              )}
                            </td>
                            <td className={summaryCellClass}>
                              {allowed ? (
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className={qtyInputClass}
                                  data-sku-id={agg.skuId}
                                  data-field="total"
                                  value={draft.total}
                                  aria-label={t("eq.summaryTotal")}
                                  onChange={(event) => setBucketDraft(agg, { total: event.target.value })}
                                  onBlur={(event) => void saveBuckets(agg, { total: event.target.value })}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      (event.target as HTMLInputElement).blur();
                                    }
                                  }}
                                />
                              ) : (
                                agg.total
                              )}
                            </td>
                            <td className={summaryCellClass}>
                              {allowed ? (
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className={qtyInputClass}
                                  data-sku-id={agg.skuId}
                                  data-field="onHand"
                                  value={draft.onHand}
                                  aria-label={t("eq.summaryOnHand")}
                                  onChange={(event) => {
                                    const onHand = event.target.value;
                                    const inUse = Number(draft.inUse) || 0;
                                    const inRepair = Number(draft.inRepair) || 0;
                                    setBucketDraft(agg, {
                                      onHand,
                                      total: String((Number(onHand) || 0) + inUse + inRepair),
                                    });
                                  }}
                                  onBlur={(event) => void saveBuckets(agg, { onHand: event.target.value })}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      (event.target as HTMLInputElement).blur();
                                    }
                                  }}
                                />
                              ) : (
                                <Badge tone="ok">{agg.onHand}</Badge>
                              )}
                            </td>
                            <td className={summaryCellClass}>
                              {allowed ? (
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className={qtyInputClass}
                                  data-sku-id={agg.skuId}
                                  data-field="inUse"
                                  value={draft.inUse}
                                  aria-label={t("eq.summaryInUse")}
                                  onChange={(event) => {
                                    const inUse = event.target.value;
                                    const onHand = Number(draft.onHand) || 0;
                                    const inRepair = Number(draft.inRepair) || 0;
                                    setBucketDraft(agg, {
                                      inUse,
                                      total: String(onHand + (Number(inUse) || 0) + inRepair),
                                    });
                                  }}
                                  onBlur={(event) => void saveBuckets(agg, { inUse: event.target.value })}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      (event.target as HTMLInputElement).blur();
                                    }
                                  }}
                                />
                              ) : (
                                <Badge tone={agg.inUse > 0 ? "warn" : "neutral"}>{agg.inUse}</Badge>
                              )}
                            </td>
                            <td className={summaryCellClass}>
                              {allowed ? (
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  className={qtyInputClass}
                                  data-sku-id={agg.skuId}
                                  data-field="inRepair"
                                  value={draft.inRepair}
                                  aria-label={t("eq.summaryInRepair")}
                                  onChange={(event) => {
                                    const inRepair = event.target.value;
                                    const onHand = Number(draft.onHand) || 0;
                                    const inUse = Number(draft.inUse) || 0;
                                    setBucketDraft(agg, {
                                      inRepair,
                                      total: String(onHand + inUse + (Number(inRepair) || 0)),
                                    });
                                  }}
                                  onBlur={(event) => void saveBuckets(agg, { inRepair: event.target.value })}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      (event.target as HTMLInputElement).blur();
                                    }
                                  }}
                                />
                              ) : (
                                <Badge tone={agg.inRepair > 0 ? "alert" : "neutral"}>{agg.inRepair}</Badge>
                              )}
                            </td>
                            <td className={summaryCellClass}>
                              <div className="flex min-h-10 items-center gap-2">
                                {agg.deployments.length === 0 ? (
                                  <span className="text-ink/40">—</span>
                                ) : (
                                  <ul className="min-w-0 flex-1 truncate text-xs leading-5">
                                    {agg.deployments.map((dep, i) => (
                                      <li key={dep.itemId} className={i === 0 ? "truncate" : "sr-only"}>
                                        {dep.qty} {agg.unit}
                                        {" · "}
                                        {t(`eq.status.${dep.status}` as MessageKey)}
                                        {" · "}
                                        {dep.orderId ? (
                                          <Link href={orderHref(dep.orderId)} className="text-copper hover:underline">
                                            {dep.label || t("eq.openOrder")}
                                          </Link>
                                        ) : (
                                          <span>{dep.label}</span>
                                        )}
                                        {agg.deployments.length > 1 ? ` +${agg.deployments.length - 1}` : ""}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {allowed ? (
                                  <button
                                    type="button"
                                    className={buttonClass("danger", "h-10 shrink-0 px-2 text-xs")}
                                    onClick={() => void onDeleteSku(agg.skuId, agg.skuName)}
                                  >
                                    {t("eq.delete")}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {kitNest ? (
                            <KitSummaryNest
                              db={db}
                              subtype={kitNest}
                              allowed={allowed}
                              refresh={refresh}
                              onFlash={setFlash}
                            />
                          ) : null}
                          </Fragment>
                        );
                      })
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Panel>

      <EquipmentKitsPanel
        db={db}
        allowed={allowed}
        revision={revision}
        refresh={refresh}
        onFlash={setFlash}
      />

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
                            assertCan(session.role, "stock.write", db);
                            moveFamily(db, family.id, "up");
                            void refresh();
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
                            assertCan(session.role, "stock.write", db);
                            moveFamily(db, family.id, "down");
                            void refresh();
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
                                  assertCan(session.role, "stock.write", db);
                                  moveSkuInFamily(db, sku.id, "up");
                                  void refresh();
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
                                  assertCan(session.role, "stock.write", db);
                                  moveSkuInFamily(db, sku.id, "down");
                                  void refresh();
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

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-1 font-medium">{t("eq.addTitle")}</h2>
          <p className="mb-3 text-sm leading-6 text-ink/70">{t("eq.addHelp")}</p>
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
              <div className="grid gap-3 sm:grid-cols-2">
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
              </div>
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
                <input
                  name="file"
                  type="file"
                  accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  required
                  className={controlClass}
                />
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

      <p className="mb-2 text-xs text-ink/50">{t("eq.qtyHint")}</p>

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
                const draft = draftFor(row);
                const dirty = draft.name.trim() !== row.skuName || Number(draft.qty) !== row.qty;
                return (
                  <tr key={row.id} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-mono text-xs">{row.skuCode}</td>
                    <td className="px-3 py-2">
                      {allowed ? (
                        <input
                          className={`${controlClass} min-w-[10rem]`}
                          value={draft.name}
                          aria-label={t("stock.name")}
                          onChange={(event) => setDraft(row.id, { name: event.target.value }, row)}
                          onBlur={(event) => void saveRow(row, { name: event.target.value, qty: draft.qty })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              (event.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      ) : (
                        row.skuName
                      )}
                      {row.note ? <p className="mt-1 text-xs text-ink/50">{row.note}</p> : null}
                    </td>
                    <td className="px-3 py-2">
                      {allowed ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className={`${controlClass} w-20`}
                            value={draft.qty}
                            aria-label={t("stock.qty")}
                            title={t("eq.qtyHint")}
                            onChange={(event) => setDraft(row.id, { qty: event.target.value }, row)}
                            onBlur={(event) => void saveRow(row, { qty: event.target.value, name: draft.name })}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                (event.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                          <span className="text-xs text-ink/50">{row.unit}</span>
                        </div>
                      ) : (
                        <>
                          {row.qty} {row.unit}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(row.status)}>{t(`eq.status.${row.status}` as MessageKey)}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {row.orderId ? (
                        <Link href={orderHref(row.orderId)} className="text-copper hover:underline">
                          {row.customerName || t("eq.openOrder")}
                        </Link>
                      ) : (
                        row.customerName || "—"
                      )}
                    </td>
                    <td className="px-3 py-2">{row.locationName || "—"}</td>
                    <td className="px-3 py-2 text-ink/50">{formatDateTime(row.updatedAt)}</td>
                    <td className="px-3 py-2">
                      {allowed ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap gap-1">
                            {dirty ? (
                              <button
                                type="button"
                                className={buttonClass("primary", "px-2 py-1 text-xs")}
                                onClick={() => void saveRow(row)}
                              >
                                {t("eq.save")}
                              </button>
                            ) : null}
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
                            <button
                              type="button"
                              className={buttonClass("danger", "px-2 py-1 text-xs")}
                              onClick={() => void onDelete(row)}
                            >
                              {t("eq.delete")}
                            </button>
                          </div>
                          {repairDraft?.itemId === row.id ? (
                            <div className="rounded-md border border-line bg-paper/80 p-2">
                              <p className="mb-2 text-xs text-ink/60">{t("eq.repairQtyHelp")}</p>
                              <div className="flex flex-wrap items-end gap-2">
                                <Field label={`${t("eq.repairQty")} (${t(`eq.action.${repairDraft.to}` as MessageKey)})`}>
                                  <input
                                    type="number"
                                    min={1}
                                    max={row.qty}
                                    step={1}
                                    className={`${controlClass} w-24`}
                                    value={repairDraft.qty}
                                    onChange={(event) =>
                                      setRepairDraft({ ...repairDraft, qty: event.target.value })
                                    }
                                  />
                                </Field>
                                <button type="button" className={buttonClass("primary", "px-2 py-1 text-xs")} onClick={onRepairApply}>
                                  {t("eq.repairApply")}
                                </button>
                                <button
                                  type="button"
                                  className={buttonClass("ghost", "px-2 py-1 text-xs")}
                                  onClick={() => setRepairDraft(null)}
                                >
                                  {t("eq.repairCancel")}
                                </button>
                              </div>
                            </div>
                          ) : null}
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
