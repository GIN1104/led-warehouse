"use client";

import { useState, type FormEvent } from "react";
import { useWarehouse } from "@/components/warehouse";
import { Badge, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can, errorText } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { newId } from "@/lib/db/sql";
import { ingestScan } from "@/lib/services/ledger";
import { listLocations, listScanEvents } from "@/lib/services/queries";

export default function ScanPage() {
  const { db, session, refresh, revision } = useWarehouse();
  const allowed = can(session.role, "scan.write");
  const locations = listLocations(db);
  const events = listScanEvents(db);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  void revision;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const direction = String(form.get("direction") ?? "in");
    try {
      assertCan(session.role, "scan.write");
      if (direction !== "in" && direction !== "out" && direction !== "move") {
        throw new Error("Неизвестное направление скана");
      }
      const result = ingestScan(
        db,
        {
          eventId: newId(),
          source: "ui",
          code: String(form.get("code") ?? ""),
          direction,
          qty: Number(form.get("qty") ?? 1),
          locationId: String(form.get("locationId") ?? "") || undefined,
          fromLocationId: String(form.get("fromLocationId") ?? "") || undefined,
        },
        session.id,
      );
      refresh();
      if (result.status === "rejected") {
        setFlash({ error: result.reason ?? "Скан отклонён" });
        return;
      }
      setFlash({ ok: "Скан принят, остаток обновлён" });
    } catch (error) {
      setFlash({ error: errorText(error) });
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Scan Events"
        title="Сканирование"
        description="Событие создаётся в браузере и сразу меняет локальный остаток. Повтор одного и того же event_id остаток не удваивает. Вебхук рамки на GitHub Pages не принимается: для него нужен сервер."
      />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel>
          <h2 className="mb-3 font-medium">Ручной скан</h2>
          {allowed ? (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
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
