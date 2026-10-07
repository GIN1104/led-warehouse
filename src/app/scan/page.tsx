import { randomUUID } from "node:crypto";
import { scanAction } from "@/app/actions";
import { can, getSession } from "@/lib/auth";
import { Badge, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { listLocations, listScanEvents } from "@/lib/services/queries";

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const flash = await searchParams;
  const session = await getSession();
  const allowed = can(session.role, "scan.write");
  const db = getDb();
  const locations = listLocations(db);
  const events = listScanEvents(db);

  return (
    <div>
      <PageHeader
        eyebrow="Scan Events"
        title="Сканирование"
        description="Сейчас событие создаёт интерфейс. Тот же контракт примет рамку или гейт через POST /api/v1/integrations/scan/events. Повтор event_id остаток не удваивает."
      />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel>
          <h2 className="mb-3 font-medium">Ручной скан</h2>
          {allowed ? (
            <form action={scanAction} className="flex flex-col gap-3">
              <input type="hidden" name="eventId" value={randomUUID()} />
              <Field label="Код SKU">
                <input name="code" required className={controlClass} placeholder="CAB-P25" />
              </Field>
              <Field label="Направление">
                <select name="direction" className={controlClass} defaultValue="in">
                  <option value="in">Приход</option>
                  <option value="out">Расход</option>
                  <option value="move">Перемещение</option>
                </select>
              </Field>
              <Field label="Количество">
                <input name="qty" type="number" min={1} defaultValue={1} className={controlClass} />
              </Field>
              <Field label="Локация">
                <select name="locationId" className={controlClass}>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Откуда">
                <select name="fromLocationId" className={controlClass} defaultValue="">
                  <option value="">Не нужно</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="submit" className={buttonClass("primary")}>
                Принять скан
              </button>
            </form>
          ) : (
            <p className="text-sm text-ink/60">Скан проводит склад. Переключитесь на Алексея.</p>
          )}
        </Panel>
        <Panel>
          <h2 className="mb-3 font-medium">Журнал событий</h2>
          <ul className="flex flex-col gap-3">
            {events.map((event) => {
              const result = JSON.parse(event.result) as { status?: string; reason?: string };
              return (
                <li key={event.id} className="border-b border-line pb-3 text-sm last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{event.code}</span>
                    <Badge tone={result.status === "accepted" ? "ok" : "alert"}>
                      {result.status === "accepted" ? "принят" : "отклонён"}
                    </Badge>
                    <span className="text-ink/50">{event.source}</span>
                  </div>
                  <p className="mt-1 text-ink/70">
                    {event.direction} · {event.qty} · {formatDateTime(event.createdAt)}
                    {result.reason ? ` · ${result.reason}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
