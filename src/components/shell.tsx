"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useI18n } from "@/components/i18n";
import { Nav } from "@/components/nav";
import { useWarehouse } from "@/components/warehouse";
import type { Lang, MessageKey } from "@/lib/i18n/messages";

const languages: Lang[] = ["ru", "en", "he"];
const SIDEBAR_KEY = "led-warehouse:sidebar";

function LanguageSwitch({ onDark = true }: { onDark?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="flex flex-wrap gap-1">
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

function RoleSwitch() {
  const { users, session, switchUser } = useWarehouse();
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs tracking-wide text-white/50 uppercase">{t("shell.who")}</p>
      {users.map((user) => (
        <button
          key={user.id}
          type="button"
          onClick={() => switchUser(user.id)}
          className={
            user.id === session.id
              ? "w-full rounded-md bg-copper px-3 py-2 text-start text-sm text-white"
              : "w-full rounded-md px-3 py-2 text-start text-sm text-white/80 hover:bg-white/10"
          }
        >
          <span className="block truncate">
            {user.name} · {t(`role.${user.role}` as MessageKey)}
          </span>
        </button>
      ))}
    </div>
  );
}

function rememberSidebar(open: boolean) {
  try {
    if (open) window.localStorage.removeItem(SIDEBAR_KEY);
    else window.localStorage.setItem(SIDEBAR_KEY, "hidden");
  } catch {
    // Приватный режим: выбор живёт только до перезагрузки.
  }
}

export function Shell({ children }: { children: ReactNode }) {
  const { session, shared, notice } = useWarehouse();
  const { t } = useI18n();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      await Promise.resolve();
      if (cancel) return;
      try {
        if (window.localStorage.getItem(SIDEBAR_KEY) === "hidden") setOpen(false);
      } catch {
        // Нет доступа к localStorage — панель остаётся открытой.
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  function toggle() {
    setOpen((current) => {
      const next = !current;
      rememberSidebar(next);
      return next;
    });
  }

  return (
    <div className="flex min-h-dvh">
      <aside
        id="app-sidebar"
        inert={open ? undefined : true}
        aria-hidden={!open}
        className={
          open
            ? "sticky top-0 flex h-dvh w-[min(16rem,72vw)] shrink-0 flex-col bg-ink text-paper"
            : "sticky top-0 h-dvh w-0 shrink-0 overflow-hidden"
        }
      >
        <div className="shrink-0 px-4 pt-4 pb-2">
          <p className="text-lg font-semibold tracking-tight">LED Warehouse</p>
          <p className="text-xs text-white/55">{t("brand.tagline")}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3">
          <Nav />
        </div>
        <div className="shrink-0 border-t border-white/10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <LanguageSwitch />
          <div className="mt-3">
            <RoleSwitch />
          </div>
          <p className="mt-3 text-[11px] leading-4 text-white/45">{shared ? t("shell.shared") : t("shell.browser")}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-sand px-3">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="app-sidebar"
            onClick={toggle}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-white text-ink"
          >
            {open ? <PanelLeftClose size={18} aria-hidden className="rtl:-scale-x-100" /> : <PanelLeft size={18} aria-hidden className="rtl:-scale-x-100" />}
            <span className="sr-only">{open ? t("shell.hide") : t("shell.show")}</span>
          </button>
          <p className="truncate font-semibold">LED Warehouse</p>
          <p className="ms-auto truncate text-xs text-ink/60">
            {session.name} · {t(`role.${session.role}` as MessageKey)}
          </p>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          {notice === "conflict" ? <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">{t("shell.conflict")}</p> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
