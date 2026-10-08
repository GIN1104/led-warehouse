"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n";
import { Nav } from "@/components/nav";
import { useWarehouse } from "@/components/warehouse";
import type { Lang, MessageKey } from "@/lib/i18n/messages";

const languages: Lang[] = ["ru", "en", "he"];

function LanguageSwitch({ onDark = true }: { onDark?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="flex gap-1">
      {languages.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          className={
            code === lang
              ? onDark
                ? "rounded px-2 py-1 text-[11px] font-medium text-white"
                : "rounded bg-ink px-2 py-1 text-[11px] font-medium text-paper"
              : onDark
                ? "rounded px-2 py-1 text-[11px] text-white/55 hover:text-white"
                : "rounded px-2 py-1 text-[11px] text-ink/50 hover:text-ink"
          }
        >
          {t(code === "ru" ? "lang.ru" : code === "en" ? "lang.en" : "lang.he")}
        </button>
      ))}
    </div>
  );
}

function RoleSwitch({ compact = false }: { compact?: boolean }) {
  const { users, session, switchUser } = useWarehouse();
  const { t } = useI18n();
  return (
    <div className={compact ? "flex gap-2" : "flex flex-col gap-2"}>
      {compact ? null : <p className="text-xs tracking-wide text-white/50 uppercase">{t("shell.who")}</p>}
      {users.map((user) => (
        <button
          key={user.id}
          type="button"
          onClick={() => switchUser(user.id)}
          className={
            compact
              ? user.id === session.id
                ? "rounded-full bg-ink px-3 py-1 text-xs text-paper"
                : "rounded-full border border-line px-3 py-1 text-xs"
              : user.id === session.id
                ? "w-full rounded-md bg-copper px-3 py-2 text-start text-sm text-white"
                : "w-full rounded-md px-3 py-2 text-start text-sm text-white/80 hover:bg-white/10"
          }
        >
          <span className="block truncate">
            {compact ? user.name : `${user.name} · ${t(`role.${user.role}` as MessageKey)}`}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { session, shared, notice } = useWarehouse();
  const { t } = useI18n();
  return (
    <div className="min-h-dvh sm:grid sm:grid-cols-[13.75rem_1fr] lg:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 hidden h-dvh max-h-dvh flex-col overflow-hidden bg-ink text-paper sm:flex">
        <div className="shrink-0 px-4 pt-4 pb-2 [@media(max-height:520px)]:py-2">
          <div className="mb-2 grid w-8 grid-cols-2 gap-0.5 [@media(max-height:520px)]:hidden" aria-hidden>
            <span className="h-3.5 w-3.5 bg-[#e7a06a]" />
            <span className="h-3.5 w-3.5 bg-copper" />
            <span className="h-3.5 w-3.5 bg-copper" />
            <span className="h-3.5 w-3.5 bg-paper" />
          </div>
          <p className="text-lg font-semibold tracking-tight [@media(max-height:520px)]:text-base">LED Warehouse</p>
          <p className="text-xs text-white/55 [@media(max-height:520px)]:hidden">{t("brand.tagline")}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3">
          <Nav />
        </div>
        <div className="shrink-0 border-t border-white/10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <LanguageSwitch />
          <div className="mt-3">
            <RoleSwitch />
          </div>
          <p className="mt-3 text-[11px] leading-4 text-white/45 [@media(max-height:520px)]:hidden">{shared ? t("shell.shared") : t("shell.browser")}</p>
        </div>
      </aside>
      <div className="border-b border-line bg-sand sm:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <p className="font-semibold">LED Warehouse</p>
          <p className="text-xs text-ink/60">
            {session.name} · {t(`role.${session.role}` as MessageKey)}
          </p>
        </div>
        <div className="px-4 pt-2">
          <LanguageSwitch onDark={false} />
        </div>
        <Nav compact />
        <div className="px-4 pb-3">
          <RoleSwitch compact />
        </div>
      </div>
      <main className="px-4 py-6 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        {notice === "conflict" ? <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">{t("shell.conflict")}</p> : null}
        {children}
      </main>
    </div>
  );
}
