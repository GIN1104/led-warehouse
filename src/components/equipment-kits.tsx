"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { Field, Panel, buttonClass, controlClass } from "@/components/ui";
import type { Sql } from "@/lib/db/sql";
import { translateError } from "@/lib/i18n/messages";
import { listProductFamilies } from "@/lib/services/catalog-hierarchy";
import {
  createKitGroup,
  createKitSubtype,
  listKitTree,
  removeKitGroup,
  removeKitSubtype,
} from "@/lib/services/kits";

type Props = {
  db: Sql;
  allowed: boolean;
  revision: number;
  refresh: () => Promise<void>;
  onFlash: (flash: { error?: string; ok?: string }) => void;
};

/** Создание комплекта под любой группой оборудования. Nested — в «Всё оборудование». */
export function EquipmentKitsPanel({ db, allowed, revision, refresh, onFlash }: Props) {
  const { t, lang } = useI18n();
  const tree = listKitTree(db);
  const families = useMemo(() => listProductFamilies(db), [db, revision]);
  const [familyMode, setFamilyMode] = useState<"existing" | "new">("existing");
  void revision;

  async function run(action: () => void, okKey: "kits.saved" | "kits.deleted") {
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
    const data = new FormData(form);
    await run(() => {
      if (familyMode === "existing") {
        const familyId = String(data.get("familyId") ?? "");
        createKitGroup(db, { familyId });
      } else {
        createKitGroup(db, { name: String(data.get("name") ?? "") });
      }
    }, "kits.saved");
    form.reset();
  }

  return (
    <Panel className="mb-4">
      <h2 className="mb-1 font-medium">{t("kits.title")}</h2>
      <p className="mb-3 text-sm leading-6 text-ink/70">{t("kits.createHelp")}</p>

      {allowed ? (
        <form onSubmit={(event) => void onCreateGroup(event)} className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={familyMode === "existing"}
                onChange={() => setFamilyMode("existing")}
              />
              {t("kits.attachExisting")}
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="mode" checked={familyMode === "new"} onChange={() => setFamilyMode("new")} />
              {t("kits.createNewFamily")}
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {familyMode === "existing" ? (
              <div className="min-w-0 flex-1 sm:min-w-[14rem]">
                <Field label={t("kits.pickFamily")}>
                  <select name="familyId" required className={controlClass} defaultValue="">
                    <option value="" disabled>
                      {t("kits.pickFamilyPlaceholder")}
                    </option>
                    {families.map((family) => (
                      <option key={family.id} value={family.id}>
                        {family.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : (
              <div className="min-w-0 flex-1 sm:min-w-[12rem]">
                <Field label={t("kits.groupName")}>
                  <input
                    name="name"
                    required
                    className={controlClass}
                    placeholder={t("kits.groupPlaceholder")}
                    maxLength={80}
                  />
                </Field>
              </div>
            )}
            <button type="submit" className={buttonClass("primary")}>
              {t("kits.groupCreate")}
            </button>
          </div>
        </form>
      ) : null}

      {tree.length === 0 ? (
        <p className="text-sm text-ink/60">{t("kits.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tree.map((group) => (
            <li key={group.id} className="rounded-md border border-line bg-paper/60 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-medium">{group.name}</span>
                <span className="text-xs text-ink/50">
                  {t("kits.subtypeCount", { count: String(group.subtypes.length) })}
                </span>
                {allowed ? (
                  <button
                    type="button"
                    className={buttonClass("danger", "ms-auto px-2 py-1 text-xs")}
                    onClick={() => {
                      if (window.confirm(t("kits.deleteGroupConfirm", { name: group.name }))) {
                        void run(() => removeKitGroup(db, group.id), "kits.deleted");
                      }
                    }}
                  >
                    {t("kits.delete")}
                  </button>
                ) : null}
              </div>

              <ul className="mb-2 flex flex-col gap-1 ps-3">
                {group.subtypes.map((subtype) => (
                  <li key={subtype.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-ink/35" aria-hidden>
                      └
                    </span>
                    <span className="font-medium">{subtype.name}</span>
                    <span className="text-xs text-ink/50">
                      {t("kits.unitCount", { count: String(subtype.units.length) })}
                      {subtype.skuId ? ` · ${t("kits.inSummary")}` : ""}
                    </span>
                    {allowed ? (
                      <button
                        type="button"
                        className={buttonClass("danger", "ms-auto px-2 py-0.5 text-xs")}
                        onClick={() => {
                          if (window.confirm(t("kits.deleteSubtypeConfirm", { name: subtype.name }))) {
                            void run(() => removeKitSubtype(db, subtype.id), "kits.deleted");
                          }
                        }}
                      >
                        {t("kits.delete")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>

              {allowed ? (
                <form
                  className="flex flex-wrap items-end gap-2 ps-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    void run(
                      () => createKitSubtype(db, group.id, String(new FormData(form).get("name") ?? "")),
                      "kits.saved",
                    );
                    form.reset();
                  }}
                >
                  <div className="min-w-0 flex-1 sm:min-w-[10rem]">
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
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
