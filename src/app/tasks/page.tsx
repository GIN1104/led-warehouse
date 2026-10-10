"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n";
import { TaskProgress } from "@/components/task-progress";
import { useWarehouse } from "@/components/warehouse";
import { Empty, Field, Flash, PageHeader, Panel, buttonClass, controlClass } from "@/components/ui";
import { assertCan, can } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { translateError } from "@/lib/i18n/messages";
import {
  WORKER_COLORS,
  createTask,
  createWorker,
  deleteTask,
  listTasks,
  listWorkers,
  renameWorker,
  setTaskProgress,
  setWorkerActive,
  setWorkerColor,
} from "@/lib/services/tasks";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function TasksPage() {
  const { db, session, shared, refresh, revision } = useWarehouse();
  const { t, lang } = useI18n();
  const allowed = can(session.role, "task.write");
  const workers = listWorkers(db);
  const [date, setDate] = useState(todayIso);
  const [color, setColor] = useState<string>(WORKER_COLORS[0]);
  const [flash, setFlash] = useState<{ error?: string; ok?: string }>({});
  const tasks = listTasks(db, date);
  const done = tasks.filter((task) => task.progress >= 100).length;
  void revision;

  useEffect(() => {
    let cancel = false;
    void (async () => {
      await Promise.resolve();
      if (cancel) return;
      const value = new URLSearchParams(window.location.search).get("date");
      if (value && DATE_RE.test(value)) setDate(value);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  function rememberDate(next: string) {
    setDate(next);
    const url = new URL(window.location.href);
    url.searchParams.set("date", next);
    window.history.replaceState(null, "", url);
  }

  async function onAddWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "");
    try {
      assertCan(session.role, "task.write");
      createWorker(db, { name, color });
      await refresh();
      form.reset();
      setColor(WORKER_COLORS[(workers.length + 1) % WORKER_COLORS.length] ?? WORKER_COLORS[0]);
      setFlash({ ok: t("tasks.workerAdded") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function onAddTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      assertCan(session.role, "task.write");
      createTask(
        db,
        {
          title: String(data.get("title") ?? ""),
          notes: String(data.get("notes") ?? ""),
          workerId: String(data.get("workerId") ?? ""),
          workDate: date,
        },
        session.id,
      );
      await refresh();
      form.reset();
      setFlash({ ok: t("tasks.saved") });
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  async function changeProgress(id: string, step: number) {
    try {
      assertCan(session.role, "task.write");
      setTaskProgress(db, id, step);
      await refresh();
    } catch (error) {
      setFlash({ error: translateError(lang, error) });
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("tasks.eyebrow")} title={t("tasks.title")} description={shared ? t("tasks.description") : t("tasks.browser")} />
      <Flash error={flash.error} ok={flash.ok} />
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel>
          <h2 className="mb-3 font-medium">{t("tasks.workers")}</h2>
          {workers.length === 0 ? <Empty>{t("tasks.noWorkers")}</Empty> : null}
          <ul className="mb-4 flex flex-col gap-3">
            {workers.map((worker) => (
              <li key={worker.id} className="rounded-md border border-line bg-white p-2">
                <div className="mb-2 flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: worker.color }} />
                  <input
                    defaultValue={worker.name}
                    disabled={!allowed}
                    aria-label={t("tasks.workerName")}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    onBlur={(event) => {
                      if (!allowed || event.target.value.trim() === worker.name) return;
                      try {
                        assertCan(session.role, "task.write");
                        renameWorker(db, worker.id, event.target.value);
                        void refresh();
                      } catch (error) {
                        event.target.value = worker.name;
                        setFlash({ error: translateError(lang, error) });
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="text-xs text-ink/50 hover:text-ink"
                    disabled={!allowed}
                    onClick={() => {
                      try {
                        assertCan(session.role, "task.write");
                        setWorkerActive(db, worker.id, false);
                        void refresh();
                      } catch (error) {
                        setFlash({ error: translateError(lang, error) });
                      }
                    }}
                  >
                    {t("tasks.hideWorker")}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {WORKER_COLORS.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      disabled={!allowed}
                      aria-label={swatch}
                      onClick={() => {
                        try {
                          assertCan(session.role, "task.write");
                          setWorkerColor(db, worker.id, swatch);
                          void refresh();
                        } catch (error) {
                          setFlash({ error: translateError(lang, error) });
                        }
                      }}
                      className="size-5 rounded-full border border-white ring-1 ring-ink/10"
                      style={{ backgroundColor: swatch, outline: worker.color === swatch ? "2px solid #1c1917" : undefined }}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {allowed ? (
            <form className="flex flex-col gap-3" onSubmit={(event) => void onAddWorker(event)}>
              <Field label={t("tasks.workerName")}>
                <input name="name" className={controlClass} required maxLength={80} />
              </Field>
              <div className="flex flex-wrap gap-1">
                {WORKER_COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={swatch}
                    aria-pressed={color === swatch}
                    onClick={() => setColor(swatch)}
                    className="size-6 rounded-full ring-2 ring-offset-1"
                    style={{ backgroundColor: swatch, boxShadow: color === swatch ? "0 0 0 2px #1c1917" : undefined }}
                  />
                ))}
              </div>
              <button type="submit" className={buttonClass("primary")}>
                {t("tasks.addWorker")}
              </button>
            </form>
          ) : null}
        </Panel>
        <Panel>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <Field label={t("tasks.day")}>
              <input
                type="date"
                className={controlClass}
                value={date}
                onChange={(event) => {
                  if (DATE_RE.test(event.target.value)) rememberDate(event.target.value);
                }}
              />
            </Field>
            <p className="text-sm text-ink/60">{t("tasks.dayProgress", { done, total: tasks.length })}</p>
          </div>
          {allowed ? (
            <form className="mb-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void onAddTask(event)}>
              <Field label={t("tasks.taskTitle")}>
                <input name="title" className={controlClass} required maxLength={200} />
              </Field>
              <Field label={t("tasks.worker")}>
                <select name="workerId" className={controlClass} required defaultValue="">
                  <option value="" disabled>
                    {t("tasks.pickWorker")}
                  </option>
                  {workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("tasks.taskNotes")}>
                <input name="notes" className={controlClass} maxLength={500} />
              </Field>
              <div className="flex items-end">
                <button type="submit" className={buttonClass("primary")} disabled={workers.length === 0}>
                  {t("tasks.addTask")}
                </button>
              </div>
            </form>
          ) : null}
          {tasks.length === 0 ? <Empty>{t("tasks.empty")}</Empty> : null}
          <ul className="flex flex-col gap-3">
            {tasks.map((task) => (
              <li key={task.id} className="overflow-hidden rounded-md border border-line bg-white">
                <div className="h-1.5" style={{ backgroundColor: task.workerColor ?? "#a8a29e" }}>
                  <div className="h-1.5 bg-white/50" style={{ width: `${100 - task.progress}%`, marginInlineStart: "auto" }} />
                </div>
                <div className="p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: task.workerColor ?? "#a8a29e" }} />
                    <p className="font-medium">{task.title}</p>
                    <span className="text-xs text-ink/50">{task.workerName}</span>
                    <span className="ms-auto text-xs font-medium">{t(`tasks.status.${task.status}`)}</span>
                  </div>
                  {task.notes ? <p className="mb-2 text-sm break-words text-ink/70">{task.notes}</p> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <TaskProgress value={task.progress} disabled={!allowed} onChange={(step) => void changeProgress(task.id, step)} />
                    {allowed ? (
                      <button
                        type="button"
                        className={buttonClass("danger", "ms-auto px-2 py-1 text-xs")}
                        onClick={() => {
                          try {
                            assertCan(session.role, "task.write");
                            deleteTask(db, task.id);
                            void refresh();
                            setFlash({ ok: t("tasks.removed") });
                          } catch (error) {
                            setFlash({ error: translateError(lang, error) });
                          }
                        }}
                      >
                        {t("tasks.remove")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
