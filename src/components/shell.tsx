"use client";

import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { useWarehouse } from "@/components/warehouse";
import { roleLabel } from "@/lib/labels";

function RoleSwitch({ compact = false }: { compact?: boolean }) {
  const { users, session, switchUser } = useWarehouse();
  return (
    <div className={compact ? "flex gap-2" : "flex flex-col gap-2"}>
      {compact ? null : <p className="text-xs tracking-wide text-white/50 uppercase">Кто работает</p>}
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
                ? "w-full rounded-md bg-copper px-3 py-2 text-left text-sm text-white"
                : "w-full rounded-md px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10"
          }
        >
            <span className="block truncate">
              {compact ? user.name : `${user.name} · ${roleLabel[user.role]}`}
            </span>
          </button>
      ))}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { session } = useWarehouse();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto bg-ink text-paper md:flex">
        <div className="px-5 pt-5 pb-3">
          <div className="mb-3 grid w-8 grid-cols-2 gap-0.5" aria-hidden>
            <span className="h-3.5 w-3.5 bg-[#e7a06a]" />
            <span className="h-3.5 w-3.5 bg-copper" />
            <span className="h-3.5 w-3.5 bg-copper" />
            <span className="h-3.5 w-3.5 bg-paper" />
          </div>
          <p className="text-lg font-semibold tracking-tight">LED Warehouse</p>
          <p className="text-xs text-white/55">Учёт проката экранов</p>
        </div>
        <div className="px-3">
          <Nav />
        </div>
        <div className="mt-auto px-4 pt-4 pb-4">
          <RoleSwitch />
          <p className="mt-3 text-[11px] leading-4 text-white/45">Данные хранятся в этом браузере.</p>
        </div>
      </aside>
      <div className="border-b border-line bg-sand md:hidden">
        <div className="flex items-center justify-between px-4 pt-4">
          <p className="font-semibold">LED Warehouse</p>
          <p className="text-xs text-ink/60">
            {session.name} · {roleLabel[session.role]}
          </p>
        </div>
        <Nav compact />
        <div className="px-4 pb-3">
          <RoleSwitch compact />
        </div>
      </div>
      <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
