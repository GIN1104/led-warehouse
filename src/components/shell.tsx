import type { ReactNode } from "react";
import { switchUser } from "@/app/actions";
import { Nav } from "@/components/nav";
import type { Role } from "@/lib/auth";
import { roleLabel } from "@/lib/labels";

type Person = { id: string; name: string; role: Role };

function RoleSwitch({ users, currentId }: { users: Person[]; currentId: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs tracking-wide text-white/50 uppercase">Кто работает</p>
      {users.map((user) => (
        <form key={user.id} action={switchUser}>
          <input type="hidden" name="userId" value={user.id} />
          <button
            type="submit"
            className={
              user.id === currentId
                ? "w-full rounded-md bg-copper px-3 py-2 text-left text-sm text-white"
                : "w-full rounded-md px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10"
            }
          >
            {user.name}
            <span className="mt-0.5 block text-xs opacity-80">{roleLabel[user.role]}</span>
          </button>
        </form>
      ))}
    </div>
  );
}

export function Shell({
  session,
  users,
  children,
}: {
  session: Person;
  users: Person[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[250px_1fr]">
      <aside className="hidden min-h-screen flex-col bg-ink text-paper md:flex">
        <div className="px-5 pt-6 pb-4">
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
        <div className="mt-auto px-4 py-5">
          <RoleSwitch users={users} currentId={session.id} />
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
        <div className="flex gap-2 px-4 pb-3">
          {users.map((user) => (
            <form key={user.id} action={switchUser}>
              <input type="hidden" name="userId" value={user.id} />
              <button
                type="submit"
                className={
                  user.id === session.id
                    ? "rounded-full bg-ink px-3 py-1 text-xs text-paper"
                    : "rounded-full border border-line px-3 py-1 text-xs"
                }
              >
                {user.name}
              </button>
            </form>
          ))}
        </div>
      </div>
      <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
