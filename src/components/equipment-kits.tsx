"use client";

import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import { useI18n } from "@/components/i18n";
import { Field, Panel, buttonClass, controlClass } from "@/components/ui";
import type { Sql } from "@/lib/db/sql";
import { translateError } from "@/lib/i18n/messages";
import {
  addKitChecklistItem,
  createKitGroup,
  createKitSubtype,
  createKitUnit,
  listKitTree,
  removeKitChecklistItem,
  removeKitGroup,
  removeKitSubtype,
  removeKitUnit,
  type KitGroup,
  type KitSubtype,
  type KitUnit,
} from "@/lib/services/kits";

type Props = {
  db: Sql;
  allowed: boolean;
  revision: number;
  refresh: () => Promise<void>;
  onFlash: (flash: { error?: string; ok?: string }) => void;
};

export function EquipmentKitsPanel({ db, allowed, revision, refresh, onFlash }: Props) {
  const { t, lang } = useI18n();
  const tree = listKitTree(db);
  void revision;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openSubtypes, setOpenSubtypes] = useState<Record<string, boolean>>({});
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});

  function toggle(
    map: Record<string, boolean>,
    setMap: (next: Record<string, boolean>) => void,
    id: string,
    fallbackOpen = true,
  ) {
    setMap({ ...map, [id]: !(map[id] ?? fallbackOpen) });
  }

  async function run(action: () => void, okKey: "kits.saved" | "kits.deleted" | "kits.itemAdded") {
    try {
      action();
      await refresh();
      onFlash({ ok: t(okKey) });
    } catch (error) {
      onFlash({ error: translateError(lang, error) });
    }
  }

  async function onCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowed) return;
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "");
    await run(() => {
      const group = createKitGroup(db, name);
      setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
    }, "kits.saved");
    form.reset();
  }

  return (
    <Panel className="mb-4">
      <h2 className="mb-1 font-medium">{t("kits.title")}</h2>
      <p className="mb-3 text-sm leading-6 text-ink/70">{t("kits.help")}</p>

      {allowed ? (
        <form onSubmit={(event) => void onCreateGroup(event)} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <Field label={t("kits.groupName")}>
              <input name="name" required className={controlClass} placeholder={t("kits.groupPlaceholder")} maxLength={80} />
            </Field>
          </div>
          <button type="submit" className={buttonClass("primary")}>
            {t("kits.groupCreate")}
          </button>
        </form>
      ) : null}

      {tree.length === 0 ? (
        <p className="text-sm text-ink/60">{t("kits.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-paper/60">
          <table className="w-full min-w-[36rem] table-fixed text-start text-sm">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-[9rem]" />
              <col className="w-[7rem]" />
            </colgroup>
            <thead className="bg-sand text-xs tracking-wide text-ink/50 uppercase">
              <tr>
                <th className="px-2 py-2 font-medium" />
                <th className="px-2 py-2 font-medium">{t("kits.colName")}</th>
                <th className="px-2 py-2 font-medium">{t("kits.colMeta")}</th>
                <th className="px-2 py-2 font-medium">{t("kits.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {tree.map((group) => (
                <KitGroupRows
                  key={group.id}
                  group={group}
                  allowed={allowed}
                  open={openGroups[group.id] ?? true}
                  openSubtypes={openSubtypes}
                  openUnits={openUnits}
                  onToggleGroup={() => toggle(openGroups, setOpenGroups, group.id)}
                  onToggleSubtype={(id) => toggle(openSubtypes, setOpenSubtypes, id)}
                  onToggleUnit={(id) => toggle(openUnits, setOpenUnits, id)}
                  onAddSubtype={(name) =>
                    void run(() => {
                      const subtype = createKitSubtype(db, group.id, name);
                      setOpenGroups((prev) => ({ ...prev, [group.id]: true }));
                      setOpenSubtypes((prev) => ({ ...prev, [subtype.id]: true }));
                    }, "kits.saved")
                  }
                  onAddUnit={(subtypeId, label) =>
                    void run(() => {
                      const unit = createKitUnit(db, subtypeId, label);
                      setOpenSubtypes((prev) => ({ ...prev, [subtypeId]: true }));
                      setOpenUnits((prev) => ({ ...prev, [unit.id]: true }));
                    }, "kits.saved")
                  }
                  onAddItem={(unitId, label, qty) =>
                    void run(() => {
                      addKitChecklistItem(db, unitId, { label, qty });
                      setOpenUnits((prev) => ({ ...prev, [unitId]: true }));
                    }, "kits.itemAdded")
                  }
                  onRemoveItem={(itemId) => void run(() => removeKitChecklistItem(db, itemId), "kits.deleted")}
                  onRemoveUnit={(unitId) => void run(() => removeKitUnit(db, unitId), "kits.deleted")}
                  onRemoveSubtype={(subtypeId) => void run(() => removeKitSubtype(db, subtypeId), "kits.deleted")}
                  onRemoveGroup={() => void run(() => removeKitGroup(db, group.id), "kits.deleted")}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Toggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className={buttonClass("ghost", "size-8 shrink-0 px-0 text-xs tabular-nums")}
      aria-expanded={open}
      aria-label={label}
      onClick={onClick}
    >
      {open ? "▾" : "▸"}
    </button>
  );
}

function KitRow({
  depth,
  tone,
  toggle,
  title,
  meta,
  actions,
}: {
  depth: 0 | 1 | 2 | 3;
  tone: "group" | "subtype" | "unit" | "item";
  toggle?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const pad = ["ps-2", "ps-8", "ps-14", "ps-20"][depth];
  const bg =
    tone === "group"
      ? "bg-sand/90"
      : tone === "subtype"
        ? "bg-sand/40"
        : tone === "unit"
          ? "bg-white/80"
          : "bg-paper/40";
  const border =
    tone === "item" ? "border-t border-dashed border-line/70" : "border-t border-line";
  return (
    <tr className={`${border} ${bg} align-middle`}>
      <td className="px-1 py-1.5 text-center">{toggle ?? null}</td>
      <td className={`px-2 py-1.5 ${pad}`}>{title}</td>
      <td className="px-2 py-1.5 text-xs text-ink/55">{meta ?? null}</td>
      <td className="px-2 py-1.5">{actions ?? null}</td>
    </tr>
  );
}

function KitGroupRows(props: {
  group: KitGroup;
  allowed: boolean;
  open: boolean;
  openSubtypes: Record<string, boolean>;
  openUnits: Record<string, boolean>;
  onToggleGroup: () => void;
  onToggleSubtype: (id: string) => void;
  onToggleUnit: (id: string) => void;
  onAddSubtype: (name: string) => void;
  onAddUnit: (subtypeId: string, label: string) => void;
  onAddItem: (unitId: string, label: string, qty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onRemoveUnit: (unitId: string) => void;
  onRemoveSubtype: (subtypeId: string) => void;
  onRemoveGroup: () => void;
}) {
  const { t } = useI18n();
  const { group, allowed, open } = props;

  return (
    <Fragment>
      <KitRow
        depth={0}
        tone="group"
        toggle={<Toggle open={open} onClick={props.onToggleGroup} label={group.name} />}
        title={<span className="font-medium">{group.name}</span>}
        meta={t("kits.subtypeCount", { count: String(group.subtypes.length) })}
        actions={
          allowed ? (
            <button
              type="button"
              className={buttonClass("danger", "px-2 py-1 text-xs")}
              onClick={() => {
                if (window.confirm(t("kits.deleteGroupConfirm", { name: group.name }))) props.onRemoveGroup();
              }}
            >
              {t("kits.delete")}
            </button>
          ) : null
        }
      />

      {open ? (
        <>
          {allowed ? (
            <tr className="border-t border-line/60 bg-paper/30">
              <td />
              <td colSpan={3} className="px-2 py-2 ps-8">
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    props.onAddSubtype(String(new FormData(form).get("name") ?? ""));
                    form.reset();
                  }}
                >
                  <div className="min-w-[10rem] flex-1">
                    <Field label={t("kits.subtypeName")}>
                      <input
                        name="name"
                        required
                        className={controlClass}
                        placeholder={t("kits.subtypePlaceholder")}
                        maxLength={80}
                      />
                    </Field>
                  </div>
                  <button type="submit" className={buttonClass("ghost", "h-10 text-xs")}>
                    {t("kits.subtypeAdd")}
                  </button>
                </form>
              </td>
            </tr>
          ) : null}

          {group.subtypes.length === 0 ? (
            <KitRow depth={1} tone="item" title={<span className="text-ink/55">{t("kits.noSubtypes")}</span>} />
          ) : (
            group.subtypes.map((subtype) => (
              <KitSubtypeRows
                key={subtype.id}
                subtype={subtype}
                allowed={allowed}
                open={props.openSubtypes[subtype.id] ?? true}
                openUnits={props.openUnits}
                onToggleSubtype={() => props.onToggleSubtype(subtype.id)}
                onToggleUnit={props.onToggleUnit}
                onAddUnit={props.onAddUnit}
                onAddItem={props.onAddItem}
                onRemoveItem={props.onRemoveItem}
                onRemoveUnit={props.onRemoveUnit}
                onRemoveSubtype={() => props.onRemoveSubtype(subtype.id)}
              />
            ))
          )}
        </>
      ) : null}
    </Fragment>
  );
}

function KitSubtypeRows(props: {
  subtype: KitSubtype;
  allowed: boolean;
  open: boolean;
  openUnits: Record<string, boolean>;
  onToggleSubtype: () => void;
  onToggleUnit: (id: string) => void;
  onAddUnit: (subtypeId: string, label: string) => void;
  onAddItem: (unitId: string, label: string, qty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onRemoveUnit: (unitId: string) => void;
  onRemoveSubtype: () => void;
}) {
  const { t } = useI18n();
  const { subtype, allowed, open } = props;

  return (
    <Fragment>
      <KitRow
        depth={1}
        tone="subtype"
        toggle={<Toggle open={open} onClick={props.onToggleSubtype} label={subtype.name} />}
        title={
          <span className="flex items-center gap-2">
            <span className="text-ink/35" aria-hidden>
              └
            </span>
            <span className="font-medium">{subtype.name}</span>
          </span>
        }
        meta={t("kits.unitCount", { count: String(subtype.units.length) })}
        actions={
          allowed ? (
            <button
              type="button"
              className={buttonClass("danger", "px-2 py-1 text-xs")}
              onClick={() => {
                if (window.confirm(t("kits.deleteSubtypeConfirm", { name: subtype.name }))) {
                  props.onRemoveSubtype();
                }
              }}
            >
              {t("kits.delete")}
            </button>
          ) : null
        }
      />

      {open ? (
        <>
          {allowed ? (
            <tr className="border-t border-dashed border-line/50 bg-paper/20">
              <td />
              <td colSpan={3} className="px-2 py-2 ps-14">
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    props.onAddUnit(subtype.id, String(new FormData(form).get("label") ?? ""));
                    form.reset();
                  }}
                >
                  <div className="min-w-[8rem]">
                    <Field label={t("kits.unitLabel")}>
                      <input
                        name="label"
                        required
                        className={controlClass}
                        placeholder={t("kits.unitPlaceholder")}
                        maxLength={80}
                      />
                    </Field>
                  </div>
                  <button type="submit" className={buttonClass("ghost", "h-10 text-xs")}>
                    {t("kits.unitAdd")}
                  </button>
                </form>
              </td>
            </tr>
          ) : null}

          {subtype.units.length === 0 ? (
            <KitRow depth={2} tone="item" title={<span className="text-ink/55">{t("kits.noUnits")}</span>} />
          ) : (
            subtype.units.map((unit) => (
              <KitUnitRows
                key={unit.id}
                unit={unit}
                allowed={allowed}
                open={props.openUnits[unit.id] ?? true}
                onToggleUnit={() => props.onToggleUnit(unit.id)}
                onAddItem={props.onAddItem}
                onRemoveItem={props.onRemoveItem}
                onRemoveUnit={() => props.onRemoveUnit(unit.id)}
              />
            ))
          )}
        </>
      ) : null}
    </Fragment>
  );
}

function KitUnitRows(props: {
  unit: KitUnit;
  allowed: boolean;
  open: boolean;
  onToggleUnit: () => void;
  onAddItem: (unitId: string, label: string, qty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onRemoveUnit: () => void;
}) {
  const { t } = useI18n();
  const { unit, allowed, open } = props;

  return (
    <Fragment>
      <KitRow
        depth={2}
        tone="unit"
        toggle={<Toggle open={open} onClick={props.onToggleUnit} label={unit.label} />}
        title={
          <span className="flex items-center gap-2">
            <span className="text-ink/35" aria-hidden>
              └
            </span>
            <span>{unit.label}</span>
          </span>
        }
        meta={t("kits.itemCount", { count: String(unit.items.length) })}
        actions={
          allowed ? (
            <button
              type="button"
              className={buttonClass("danger", "px-2 py-1 text-xs")}
              onClick={() => {
                if (window.confirm(t("kits.deleteUnitConfirm", { name: unit.label }))) props.onRemoveUnit();
              }}
            >
              {t("kits.delete")}
            </button>
          ) : null
        }
      />

      {open ? (
        <>
          {unit.items.length === 0 ? (
            <KitRow depth={3} tone="item" title={<span className="text-ink/55">{t("kits.noItems")}</span>} />
          ) : (
            unit.items.map((item) => (
              <KitRow
                key={item.id}
                depth={3}
                tone="item"
                title={
                  <span className="flex items-center gap-2 font-mono text-xs text-ink/80">
                    <span className="text-ink/30" aria-hidden>
                      ·
                    </span>
                    {item.label}
                    {item.qty > 1 ? `×${item.qty}` : ""}
                  </span>
                }
                actions={
                  allowed ? (
                    <button
                      type="button"
                      className={buttonClass("ghost", "px-2 py-0.5 text-xs text-ink/55")}
                      onClick={() => props.onRemoveItem(item.id)}
                    >
                      {t("kits.removeItem")}
                    </button>
                  ) : null
                }
              />
            ))
          )}

          {allowed ? (
            <tr className="border-t border-dashed border-line/40 bg-paper/20">
              <td />
              <td colSpan={3} className="px-2 py-2 ps-20">
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const data = new FormData(form);
                    props.onAddItem(unit.id, String(data.get("label") ?? ""), Number(data.get("qty") ?? 1) || 1);
                    form.reset();
                  }}
                >
                  <div className="min-w-[9rem] flex-1">
                    <Field label={t("kits.itemLabel")}>
                      <input
                        name="label"
                        required
                        className={controlClass}
                        placeholder={t("kits.itemPlaceholder")}
                        maxLength={80}
                      />
                    </Field>
                  </div>
                  <div className="w-20">
                    <Field label={t("kits.itemQty")}>
                      <input
                        name="qty"
                        type="number"
                        min={1}
                        step={1}
                        defaultValue={1}
                        className={`${controlClass} h-10`}
                      />
                    </Field>
                  </div>
                  <button type="submit" className={buttonClass("ghost", "h-10 text-xs")}>
                    {t("kits.itemAdd")}
                  </button>
                </form>
              </td>
            </tr>
          ) : null}
        </>
      ) : null}
    </Fragment>
  );
}
