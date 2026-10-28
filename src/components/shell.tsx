"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useEmailAuth } from "@/components/auth-gate";
import { useI18n } from "@/components/i18n";
import { Nav } from "@/components/nav";
import { useWarehouse } from "@/components/warehouse";
import type { Lang, MessageKey } from "@/lib/i18n/messages";
import { getRoleLabels } from "@/lib/services/people";
import type { Role } from "@/lib/services/queries";
import { cn } from "@/lib/utils";

const languages: Lang[] = ["ru", "en", "he"];
const SIDEBAR_KEY = "led-warehouse:sidebar";
const DESKTOP_MQ = "(min-width: 768px)";

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

function roleCaption(role: Role, labels: Record<Role, string>, t: (key: MessageKey) => string): string {
  return labels[role] || t(`role.${role}` as MessageKey);
}

function RoleSwitch() {
  const { db, users, session, switchUser, revision } = useWarehouse();
  const { t } = useI18n();
  const labels = getRoleLabels(db);
  void revision;
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
            {user.name} · {roleCaption(user.role, labels, t)}
          </span>
        </button>
      ))}
    </div>
  );
}

function rememberSidebar(open: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, open ? "open" : "hidden");
  } catch {
    // Приватный режим: выбор живёт только до перезагрузки.
  }
}

function isDesktop(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_MQ).matches;
}

export function Shell({ children }: { children: ReactNode }) {
  const { db, session, shared, notice, revision } = useWarehouse();
  const { session: auth, logout } = useEmailAuth();
  const { t } = useI18n();
  // На телефоне по умолчанию закрыта — иначе сайдбар съедает ~72vw.
  const [open, setOpen] = useState(false);
  const labels = getRoleLabels(db);
  void revision;

  useEffect(() => {
    let cancel = false;
    void (async () => {
      await Promise.resolve();
      if (cancel) return;
      try {
        const stored = window.localStorage.getItem(SIDEBAR_KEY);
        if (stored === "hidden") setOpen(false);
        else if (stored === "open") setOpen(true);
        else setOpen(isDesktop());
      } catch {
        setOpen(isDesktop());
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

  function closeMobileNav() {
    if (isDesktop()) return;
    setOpen(false);
    rememberSidebar(false);
  }

  return (
    <div className="flex min-h-dvh">
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-ink/45 md:hidden"
          aria-label={t("shell.hide")}
          onClick={closeMobileNav}
        />
      ) : null}
      <aside
        id="app-sidebar"
        inert={open ? undefined : true}
        aria-hidden={!open}
        className={cn(
          "flex h-dvh flex-col bg-ink text-paper",
          // Mobile: overlay drawer — не сжимает main.
          "fixed inset-y-0 start-0 z-40 w-[min(16rem,85vw)] transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
          // Desktop: in-flow sticky column.
          "md:sticky md:top-0 md:z-auto md:translate-x-0 md:rtl:translate-x-0 md:transition-none",
          open ? "md:w-64 md:shrink-0" : "md:w-0 md:overflow-hidden",
        )}
      >
        <div className="shrink-0 px-4 pt-4 pb-2">
          <p className="text-lg font-semibold tracking-tight">LED Warehouse</p>
          <p className="text-xs text-white/55">{t("brand.tagline")}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3">
          <Nav onNavigate={closeMobileNav} />
        </div>
        <div className="shrink-0 border-t border-white/10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <LanguageSwitch />
          <div className="mt-3">
            <RoleSwitch />
          </div>
          {auth ? (
            <div className="mt-3">
              <p className="truncate text-[11px] text-white/45">{auth.email}</p>
              <button
                type="button"
                onClick={logout}
                className="mt-1 w-full rounded-md px-3 py-2 text-start text-sm text-white/80 hover:bg-white/10"
              >
                {t("login.logout")}
              </button>
            </div>
          ) : null}
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
            {open ? (
              <PanelLeftClose size={18} aria-hidden className="rtl:-scale-x-100" />
            ) : (
              <PanelLeft size={18} aria-hidden className="rtl:-scale-x-100" />
            )}
            <span className="sr-only">{open ? t("shell.hide") : t("shell.show")}</span>
          </button>
          <p className="truncate font-semibold">LED Warehouse</p>
          <p className="ms-auto max-w-[45%] truncate text-xs text-ink/60 sm:max-w-none">
            {session.name} · {roleCaption(session.role, labels, t)}
            {auth ? ` · ${auth.email}` : ""}
          </p>
        </header>
        <main className="min-w-0 flex-1 overflow-x-clip px-3 py-5 sm:px-4 md:px-8 md:py-8">
          {notice === "conflict" ? (
            <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">{t("shell.conflict")}</p>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
