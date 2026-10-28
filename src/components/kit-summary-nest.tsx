"use client";

import { Fragment, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { buttonClass, controlClass } from "@/components/ui";
import type { Sql } from "@/lib/db/sql";
import { translateError } from "@/lib/i18n/messages";
import {
  addKitChecklistItem,
  createKitUnit,
  removeKitChecklistItem,
  removeKitUnit,
  type KitSubtype,
} from "@/lib/services/kits";

const cell = "px-1.5 py-1.5 align-middle md:px-3";

type Props = {
  db: Sql;
  subtype: KitSubtype & { groupName: string };
  allowed: boolean;
  refresh: () => Promise<void>;
  onFlash: (flash: { error?: string; ok?: string }) => void;
};

/** Nested-подстроки комплекта под SKU в сводке «Всё оборудование». */
export function KitSummaryNest({ db, subtype, allowed, refresh, onFlash }: Props) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(true);
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});

  async function run(action: () => void, ok: "kits.saved" | "kits.deleted" | "kits.itemAdded") {
    try {
      action();
      await refresh();
      onFlash({ ok: t(ok) });
    } catch (error) {
      onFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <Fragment>
      <tr className="border-t border-dashed border-line/70 bg-sand/30">
        <td className={cell}>
          <button
            type="button"
            className={buttonClass("ghost", "size-8 px-0 text-xs")}
            aria-expanded={open}
            aria-label={subtype.name}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "▾" : "▸"}
          </button>
        </td>
        <td className={`${cell} ps-6 font-mono text-[10px] uppercase tracking-wide text-ink/40`}>
          {t("kits.nestBadge")}
        </td>
        <td className={`${cell} ps-2`} colSpan={5}>
          <span className="text-xs text-ink/60">
            {subtype.groupName} → <span className="font-medium text-ink">{subtype.name}</span>
            {" · "}
            {t("kits.unitCount", { count: String(subtype.units.length) })}
          </span>
        </td>
        <td className={cell} />
      </tr>

      {open
        ? subtype.units.map((unit) => {
            const unitOpen = openUnits[unit.id] ?? true;
            return (
              <Fragment key={unit.id}>
                <tr className="border-t border-line/50 bg-paper/50">
                  <td className={cell}>
                    <button
                      type="button"
                      className={buttonClass("ghost", "ms-4 size-8 px-0 text-xs")}
                      aria-expanded={unitOpen}
                      onClick={() => setOpenUnits((prev) => ({ ...prev, [unit.id]: !unitOpen }))}
                    >
                      {unitOpen ? "▾" : "▸"}
                    </button>
                  </td>
                  <td className={`${cell} ps-10 font-mono text-xs text-ink/45`}>—</td>
                  <td className={`${cell} ps-6`} colSpan={5}>
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span className="text-ink/35" aria-hidden>
                        └
                      </span>
                      <span className="font-medium">{unit.label}</span>
                      <span className="text-xs text-ink/50">
                        {t("kits.itemCount", { count: String(unit.items.length) })}
                      </span>
                    </span>
                  </td>
                  <td className={cell}>
                    {allowed ? (
                      <button
                        type="button"
                        className={buttonClass("danger", "h-8 px-2 text-xs")}
                        onClick={() => {
                          if (window.confirm(t("kits.deleteUnitConfirm", { name: unit.label }))) {
                            void run(() => removeKitUnit(db, unit.id), "kits.deleted");
                          }
                        }}
                      >
                        {t("kits.delete")}
                      </button>
                    ) : null}
                  </td>
                </tr>

                {unitOpen ? (
                  <>
                    {unit.items.length === 0 ? (
                      <tr className="border-t border-dashed border-line/40">
                        <td className={cell} />
                        <td className={cell} />
                        <td className={`${cell} ps-12 text-xs text-ink/50`} colSpan={6}>
                          {t("kits.noItems")}
                        </td>
                      </tr>
                    ) : (
                      unit.items.map((item) => (
                        <tr key={item.id} className="border-t border-dashed border-line/40 bg-white/40">
                          <td className={cell} />
                          <td className={`${cell} ps-12 font-mono text-[10px] text-ink/35`}>·</td>
                          <td className={`${cell} ps-12`} colSpan={5}>
                            <span className="font-mono text-xs text-ink/80">
                              {item.label}
                              {item.qty > 1 ? `×${item.qty}` : ""}
                            </span>
                          </td>
                          <td className={cell}>
                            {allowed ? (
                              <button
                                type="button"
                                className={buttonClass("ghost", "h-8 px-2 text-xs text-ink/55")}
                                onClick={() => void run(() => removeKitChecklistItem(db, item.id), "kits.deleted")}
                              >
                                {t("kits.removeItem")}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}

                    {allowed ? (
                      <tr className="border-t border-dashed border-line/30 bg-paper/30">
                        <td className={cell} />
                        <td className={cell} />
                        <td className={`${cell} ps-12`} colSpan={6}>
                          <form
                            className="flex flex-wrap items-center gap-2"
                            onSubmit={(event: FormEvent<HTMLFormElement>) => {
                              event.preventDefault();
                              const form = event.currentTarget;
                              const data = new FormData(form);
                              void run(
                                () =>
                                  addKitChecklistItem(db, unit.id, {
                                    label: String(data.get("label") ?? ""),
                                    qty: Number(data.get("qty") ?? 1) || 1,
                                  }),
                                "kits.itemAdded",
                              );
                              form.reset();
                            }}
                          >
                            <input
                              name="label"
                              required
                              className={`${controlClass} h-8 min-w-0 flex-1 py-0 text-xs sm:min-w-[8rem]`}
                              placeholder={t("kits.itemPlaceholder")}
                              maxLength={80}
                              aria-label={t("kits.itemLabel")}
                            />
                            <input
                              name="qty"
                              type="number"
                              min={1}
                              step={1}
                              defaultValue={1}
                              className={`${controlClass} h-8 w-14 py-0 text-xs sm:w-16`}
                              aria-label={t("kits.itemQty")}
                            />
                            <button type="submit" className={buttonClass("ghost", "h-8 px-2 text-xs")}>
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
          })
        : null}

      {open && allowed ? (
        <tr className="border-t border-dashed border-line/40 bg-sand/20">
          <td className={cell} />
          <td className={cell} />
          <td className={`${cell} ps-6`} colSpan={6}>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                void run(
                  () => createKitUnit(db, subtype.id, String(new FormData(form).get("label") ?? "")),
                  "kits.saved",
                );
                form.reset();
              }}
            >
              <input
                name="label"
                required
                className={`${controlClass} h-8 min-w-0 flex-1 py-0 text-xs sm:min-w-[7rem] sm:flex-none`}
                placeholder={t("kits.unitPlaceholder")}
                maxLength={80}
                aria-label={t("kits.unitLabel")}
              />
              <button type="submit" className={buttonClass("ghost", "h-8 px-2 text-xs")}>
                {t("kits.unitAdd")}
              </button>
            </form>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
