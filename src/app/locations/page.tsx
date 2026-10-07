import { createLocationAction } from "@/app/actions";
import { can, getSession } from "@/lib/auth";
import { Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { getDb } from "@/lib/db";
import { locationKindLabel } from "@/lib/labels";
import { listLocations } from "@/lib/services/queries";

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const flash = await searchParams;
  const session = await getSession();
  const allowed = can(session.role, "location.write");
  const rows = listLocations(getDb());

  return (
    <div>
      <PageHeader
        eyebrow="Склад"
        title="Локации"
        description="Зоны и ячейки без карты. Привязка к mapper появится позже, контракт локаций уже отдельный."
      />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-lg border border-line bg-sand">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-paper text-xs tracking-wide text-ink/50 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Название</th>
                <th className="px-3 py-2 font-medium">Тип</th>
                <th className="px-3 py-2 font-medium">Внутри</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{locationKindLabel[row.kind]}</td>
                  <td className="px-3 py-2 text-ink/70">{row.parentName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Panel>
          <h2 className="mb-3 font-medium">Новая локация</h2>
          {allowed ? (
            <form action={createLocationAction} className="flex flex-col gap-3">
              <Field label="Название">
                <input name="name" required className={controlClass} placeholder="Зона D — запас" />
              </Field>
              <Field label="Тип">
                <select name="kind" className={controlClass} defaultValue="zone">
                  <option value="warehouse">Склад</option>
                  <option value="zone">Зона</option>
                  <option value="bin">Ячейка</option>
                </select>
              </Field>
              <Field label="Родитель">
                <select name="parentId" className={controlClass} defaultValue="">
                  <option value="">Нет</option>
                  {rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="submit" className={buttonClass("primary")}>
                Добавить локацию
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink/60">Локации заводит роль склада. Переключитесь на Алексея.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
