import type { CalendarItem } from "@/lib/calendar/types";
import { DomainError } from "@/lib/domain/errors";
import { newId, type Sql } from "@/lib/db/sql";

/** Палитра карточек: тёмные цвета, чтобы белый текст и полоска прогресса читались. */
export const WORKER_COLORS = ["#9a3412", "#1d4e89", "#166534", "#6d28d9", "#b45309", "#be123c", "#0f766e", "#3f6212"] as const;

export const PROGRESS_STEPS = [0, 25, 50, 75, 100] as const;

export type ProgressStep = (typeof PROGRESS_STEPS)[number];
export type TaskStatus = "todo" | "doing" | "done";

export type Worker = {
  id: string;
  name: string;
  color: string;
  active: boolean;
  createdAt: number;
};

export type WorkTask = {
  id: string;
  title: string;
  notes: string;
  workerId: string | null;
  workerName: string | null;
  workerColor: string | null;
  workDate: string;
  progress: number;
  status: TaskStatus;
  createdAt: number;
  createdBy: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function statusOf(progress: number): TaskStatus {
  if (progress >= 100) return "done";
  if (progress <= 0) return "todo";
  return "doing";
}

function isStep(value: number): value is ProgressStep {
  return (PROGRESS_STEPS as readonly number[]).includes(value);
}

function assertColor(color: string): string {
  const found = WORKER_COLORS.find((item) => item === color.toLowerCase());
  if (!found) throw new DomainError("Выберите цвет работника");
  return found;
}

function assertName(name: string): string {
  const next = name.trim();
  if (!next || next.length > 80) throw new DomainError("Укажите имя работника");
  return next;
}

export function listWorkers(db: Sql, includeHidden = false): Worker[] {
  const rows = db.all<{ id: string; name: string; color: string; active: number; createdAt: number }>(
    `SELECT id, name, color, active, created_at AS createdAt FROM workers ORDER BY name`,
  );
  return rows
    .filter((row) => includeHidden || row.active === 1)
    .map((row) => ({ id: row.id, name: row.name, color: row.color, active: row.active === 1, createdAt: row.createdAt }));
}

export function createWorker(db: Sql, input: { name: string; color: string }): Worker {
  const name = assertName(input.name);
  const color = assertColor(input.color);
  const id = newId();
  const createdAt = Date.now();
  db.run(`INSERT INTO workers (id, name, color, active, created_at) VALUES (?, ?, ?, 1, ?)`, [id, name, color, createdAt]);
  return { id, name, color, active: true, createdAt };
}

export function setWorkerColor(db: Sql, id: string, color: string): void {
  const next = assertColor(color);
  const row = db.get<{ id: string }>(`SELECT id FROM workers WHERE id = ?`, [id]);
  if (!row) throw new DomainError("Работник не найден");
  db.run(`UPDATE workers SET color = ? WHERE id = ?`, [next, id]);
}

export function renameWorker(db: Sql, id: string, name: string): void {
  const next = assertName(name);
  const row = db.get<{ id: string }>(`SELECT id FROM workers WHERE id = ?`, [id]);
  if (!row) throw new DomainError("Работник не найден");
  db.run(`UPDATE workers SET name = ? WHERE id = ?`, [next, id]);
}

export function setWorkerActive(db: Sql, id: string, active: boolean): void {
  const row = db.get<{ id: string }>(`SELECT id FROM workers WHERE id = ?`, [id]);
  if (!row) throw new DomainError("Работник не найден");
  db.run(`UPDATE workers SET active = ? WHERE id = ?`, [active ? 1 : 0, id]);
}

const TASK_SQL = `SELECT t.id, t.title, t.notes, t.worker_id AS workerId, w.name AS workerName, w.color AS workerColor,
       t.work_date AS workDate, t.progress, t.status, t.created_at AS createdAt, t.created_by AS createdBy
FROM work_tasks t
LEFT JOIN workers w ON w.id = t.worker_id`;

export function listTasks(db: Sql, workDate?: string): WorkTask[] {
  const rows = workDate
    ? db.all<WorkTask>(`${TASK_SQL} WHERE t.work_date = ? ORDER BY w.name, t.title`, [workDate])
    : db.all<WorkTask>(`${TASK_SQL} ORDER BY t.work_date, w.name, t.title`);
  return rows.map((row) => ({ ...row, status: row.status as TaskStatus, progress: Number(row.progress) }));
}

export function createTask(
  db: Sql,
  input: { title: string; notes?: string; workerId: string; workDate: string },
  actorId: string,
): string {
  const title = input.title.trim();
  if (!title || title.length > 200) throw new DomainError("Укажите текст задания");
  if (!DATE_RE.test(input.workDate)) throw new DomainError("Укажите день задания");
  const notes = (input.notes ?? "").trim();
  if (notes.length > 500) throw new DomainError("Заметка задания слишком длинная");
  const worker = db.get<{ id: string; active: number }>(`SELECT id, active FROM workers WHERE id = ?`, [input.workerId]);
  if (!worker || worker.active !== 1) throw new DomainError("Работник не найден");
  const id = newId();
  db.run(
    `INSERT INTO work_tasks (id, title, notes, worker_id, work_date, progress, status, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, 0, 'todo', ?, ?)`,
    [id, title, notes, worker.id, input.workDate, Date.now(), actorId],
  );
  return id;
}

export function setTaskProgress(db: Sql, id: string, progress: number): void {
  if (!isStep(progress)) throw new DomainError("Прогресс задания задаётся шагом 25%");
  const row = db.get<{ id: string }>(`SELECT id FROM work_tasks WHERE id = ?`, [id]);
  if (!row) throw new DomainError("Задание не найдено");
  db.run(`UPDATE work_tasks SET progress = ?, status = ? WHERE id = ?`, [progress, statusOf(progress), id]);
}

export function deleteTask(db: Sql, id: string): void {
  const row = db.get<{ id: string }>(`SELECT id FROM work_tasks WHERE id = ?`, [id]);
  if (!row) throw new DomainError("Задание не найдено");
  db.run(`DELETE FROM work_tasks WHERE id = ?`, [id]);
}

/** Задания дня становятся полосками календаря цвета работника. */
export function tasksToCalendarItems(tasks: WorkTask[]): CalendarItem[] {
  return tasks.map((task) => ({
    id: `task-${task.id}`,
    title: task.workerName ? `${task.workerName}: ${task.title}` : task.title,
    startDate: task.workDate,
    endDate: task.workDate,
    allDay: true,
    source: "task" as const,
    taskId: task.id,
    color: task.workerColor ?? undefined,
    progress: task.progress,
    note: task.notes || undefined,
  }));
}
