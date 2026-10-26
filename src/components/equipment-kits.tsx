"use client";

import { useState, type FormEvent } from "react";
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
    const current = map[id] ?? fallbackOpen;
    setMap({ ...map, [id]: !current });
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
        <ul className="flex flex-col gap-2">
          {tree.map((group) => (
            <KitGroupBlock
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
        </ul>
      )}
    </Panel>
  );
}

function KitGroupBlock(props: {
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
    <li className="rounded-md border border-line bg-paper/60">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          className={buttonClass("ghost", "px-2 py-0.5 text-xs tabular-nums")}
          aria-expanded={open}
          onClick={props.onToggleGroup}
        >
          {open ? "▾" : "▸"}
        </button>
        <span className="font-medium">{group.name}</span>
        <span className="text-xs text-ink/50">
          {t("kits.subtypeCount", { count: String(group.subtypes.length) })}
        </span>
        {allowed ? (
          <button
            type="button"
            className={buttonClass("danger", "ms-auto px-2 py-0.5 text-xs")}
            onClick={() => {
              if (window.confirm(t("kits.deleteGroupConfirm", { name: group.name }))) props.onRemoveGroup();
            }}
          >
            {t("kits.delete")}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="border-t border-line px-3 py-2 ps-8">
          {allowed ? (
            <form
              className="mb-3 flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const name = String(new FormData(form).get("name") ?? "");
                props.onAddSubtype(name);
                form.reset();
              }}
            >
              <div className="min-w-[10rem] flex-1">
                <Field label={t("kits.subtypeName")}>
                  <input name="name" required className={controlClass} placeholder={t("kits.subtypePlaceholder")} maxLength={80} />
                </Field>
              </div>
              <button type="submit" className={buttonClass("ghost", "text-xs")}>
                {t("kits.subtypeAdd")}
              </button>
            </form>
          ) : null}

          {group.subtypes.length === 0 ? (
            <p className="text-sm text-ink/55">{t("kits.noSubtypes")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {group.subtypes.map((subtype) => {
                const subOpen = props.openSubtypes[subtype.id] ?? true;
                return (
                  <li key={subtype.id} className="rounded border border-line/80 bg-white/70">
                    <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                      <button
                        type="button"
                        className={buttonClass("ghost", "px-2 py-0.5 text-xs")}
                        aria-expanded={subOpen}
                        onClick={() => props.onToggleSubtype(subtype.id)}
                      >
                        {subOpen ? "▾" : "▸"}
                      </button>
                      <span className="text-sm font-medium">{subtype.name}</span>
                      <span className="text-xs text-ink/50">
                        {t("kits.unitCount", { count: String(subtype.units.length) })}
                      </span>
                      {allowed ? (
                        <button
                          type="button"
                          className={buttonClass("danger", "ms-auto px-2 py-0.5 text-xs")}
                          onClick={() => {
                            if (window.confirm(t("kits.deleteSubtypeConfirm", { name: subtype.name }))) {
                              props.onRemoveSubtype(subtype.id);
                            }
                          }}
                        >
                          {t("kits.delete")}
                        </button>
                      ) : null}
                    </div>

                    {subOpen ? (
                      <div className="border-t border-line/70 px-2 py-2 ps-6">
                        {allowed ? (
                          <form
                            className="mb-2 flex flex-wrap items-end gap-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const form = event.currentTarget;
                              const label = String(new FormData(form).get("label") ?? "");
                              props.onAddUnit(subtype.id, label);
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
                            <button type="submit" className={buttonClass("ghost", "text-xs")}>
                              {t("kits.unitAdd")}
                            </button>
                          </form>
                        ) : null}

                        {subtype.units.length === 0 ? (
                          <p className="text-sm text-ink/55">{t("kits.noUnits")}</p>
                        ) : (
                          <ul className="flex flex-col gap-2">
                            {subtype.units.map((unit) => {
                              const unitOpen = props.openUnits[unit.id] ?? true;
                              return (
                                <li key={unit.id} className="rounded border border-dashed border-line bg-sand/40">
                                  <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                                    <button
                                      type="button"
                                      className={buttonClass("ghost", "px-2 py-0.5 text-xs")}
                                      aria-expanded={unitOpen}
                                      onClick={() => props.onToggleUnit(unit.id)}
                                    >
                                      {unitOpen ? "▾" : "▸"}
                                    </button>
                                    <span className="text-sm">{unit.label}</span>
                                    <span className="text-xs text-ink/50">
                                      {t("kits.itemCount", { count: String(unit.items.length) })}
                                    </span>
                                    {allowed ? (
                                      <button
                                        type="button"
                                        className={buttonClass("danger", "ms-auto px-2 py-0.5 text-xs")}
                                        onClick={() => {
                                          if (window.confirm(t("kits.deleteUnitConfirm", { name: unit.label }))) {
                                            props.onRemoveUnit(unit.id);
                                          }
                                        }}
                                      >
                                        {t("kits.delete")}
                                      </button>
                                    ) : null}
                                  </div>

                                  {unitOpen ? (
                                    <div className="border-t border-line/60 px-2 py-2 ps-6">
                                      <ul className="mb-2 flex flex-col gap-1">
                                        {unit.items.length === 0 ? (
                                          <li className="text-sm text-ink/55">{t("kits.noItems")}</li>
                                        ) : (
                                          unit.items.map((item) => (
                                            <li
                                              key={item.id}
                                              className="flex flex-wrap items-center gap-2 text-sm"
                                            >
                                              <span className="font-mono text-xs text-ink/70">
                                                {item.label}
                                                {item.qty > 1 ? `×${item.qty}` : ""}
                                              </span>
                                              {allowed ? (
                                                <button
                                                  type="button"
                                                  className={buttonClass("ghost", "px-1.5 py-0 text-xs text-ink/55")}
                                                  onClick={() => props.onRemoveItem(item.id)}
                                                >
                                                  {t("kits.removeItem")}
                                                </button>
                                              ) : null}
                                            </li>
                                          ))
                                        )}
                                      </ul>
                                      {allowed ? (
                                        <form
                                          className="flex flex-wrap items-end gap-2"
                                          onSubmit={(event) => {
                                            event.preventDefault();
                                            const form = event.currentTarget;
                                            const data = new FormData(form);
                                            const label = String(data.get("label") ?? "");
                                            const qty = Number(data.get("qty") ?? 1) || 1;
                                            props.onAddItem(unit.id, label, qty);
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
                                          <button type="submit" className={buttonClass("ghost", "text-xs")}>
                                            {t("kits.itemAdd")}
                                          </button>
                                        </form>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}
