"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { useWarehouse } from "@/components/warehouse";
import { Empty, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { translateError, type MessageKey } from "@/lib/i18n/messages";
import {
  PEOPLE_ROLES,
  createPerson,
  getRoleLabels,
  removePerson,
  setRoleLabels,
  updatePerson,
  type RoleLabels,
} from "@/lib/services/people";
import type { Role } from "@/lib/services/queries";

export default function PeoplePage() {
  const { db, session, users, shared, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "people.write");
  const editor = users.find((user) => can(user.role, "people.write"))?.name ?? "";
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  const [labels, setLabels] = useState<RoleLabels>(() => getRoleLabels(db));
  void revision;

  function roleName(role: Role): string {
    return labels[role] || t(`role.${role}` as MessageKey);
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      assertCan(session.role, "people.write");
      createPerson(db, {
        name: String(data.get("name") ?? ""),
        role: String(data.get("role") ?? "warehouse") as Role,
      });
      await refresh();
      form.reset();
      setFlash({ ok: t("people.added") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onSavePerson(id: string, form: HTMLFormElement) {
    const data = new FormData(form);
    try {
      assertCan(session.role, "people.write");
      updatePerson(db, id, {
        name: String(data.get("name") ?? ""),
        role: String(data.get("role") ?? "warehouse") as Role,
      });
      await refresh();
      setFlash({ ok: t("people.updated") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onRemove(id: string) {
    if (id === session.id) {
      setFlash({ error: t("people.cannotRemoveSelf") });
      return;
    }
    try {
      assertCan(session.role, "people.write");
      removePerson(db, id, { currentUserId: session.id });
      await refresh();
      setFlash({ ok: t("people.removed") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onSaveLabels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      assertCan(session.role, "people.write");
      const next = setRoleLabels(db, {
        warehouse: String(data.get("warehouse") ?? ""),
        manager: String(data.get("manager") ?? ""),
        logistics: String(data.get("logistics") ?? ""),
        admin: String(data.get("admin") ?? ""),
      });
      setLabels(next);
      await refresh();
      setFlash({ ok: t("people.labelsSaved") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("people.eyebrow")}
        title={t("people.title")}
        description={shared ? t("people.description") : t("people.browser")}
      />
      <Flash error={flash.error} ok={flash.ok} />
      {!allowed ? <p className="mb-4 text-sm text-ink/70">{t("people.switch", { name: editor || "—" })}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel>
          <h2 className="mb-3 font-medium">{t("people.list")}</h2>
          {users.length === 0 ? <Empty>{t("people.empty")}</Empty> : null}
          <ul className="mb-4 flex flex-col gap-3">
            {users.map((user) => (
              <li key={user.id} className="rounded-md border border-line bg-white p-3">
                <form
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto] sm:items-end"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onSavePerson(user.id, event.currentTarget);
                  }}
                >
                  <Field label={t("people.name")}>
                    <input
                      name="name"
                      defaultValue={user.name}
                      disabled={!allowed}
                      className={controlClass}
                      required
                      maxLength={80}
                    />
                  </Field>
                  <Field label={t("people.role")}>
                    <select name="role" defaultValue={user.role} disabled={!allowed} className={controlClass}>
                      {PEOPLE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {roleName(role)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button type="submit" disabled={!allowed} className={buttonClass("primary")}>
                    {t("people.save")}
                  </button>
                  <button
                    type="button"
                    disabled={!allowed || user.id === session.id || users.length <= 1}
                    className={buttonClass("danger")}
                    onClick={() => void onRemove(user.id)}
                  >
                    {t("people.remove")}
                  </button>
                </form>
              </li>
            ))}
          </ul>

          {allowed ? (
            <form onSubmit={(event) => void onAdd(event)} className="grid gap-2 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
              <Field label={t("people.name")}>
                <input name="name" className={controlClass} required maxLength={80} placeholder={t("people.add")} />
              </Field>
              <Field label={t("people.role")}>
                <select name="role" defaultValue="warehouse" className={controlClass}>
                  {PEOPLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleName(role)}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="submit" className={buttonClass("primary")}>
                {t("people.add")}
              </button>
            </form>
          ) : null}
        </Panel>

        <Panel>
          <h2 className="mb-1 font-medium">{t("people.labelsTitle")}</h2>
          <p className="mb-4 text-sm text-ink/65">{t("people.labelsHelp")}</p>
          <form onSubmit={(event) => void onSaveLabels(event)} className="flex flex-col gap-3">
            {PEOPLE_ROLES.map((role) => (
              <Field key={role} label={t(`role.${role}` as MessageKey)}>
                <input
                  name={role}
                  defaultValue={labels[role]}
                  disabled={!allowed}
                  className={controlClass}
                  required
                  maxLength={40}
                />
              </Field>
            ))}
            {allowed ? (
              <button type="submit" className={buttonClass("primary", "self-start")}>
                {t("people.save")}
              </button>
            ) : null}
          </form>
        </Panel>
      </div>
    </div>
  );
}
