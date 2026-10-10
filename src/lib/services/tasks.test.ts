import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/memory";
import { createTask, createWorker, listTasks, setTaskProgress, setWorkerActive, tasksToCalendarItems } from "@/lib/services/tasks";

describe("задания работников", () => {
  it("сохраняет работника, задание дня и прогресс", () => {
    const db = createDb();
    const worker = createWorker(db, { name: "Илья", color: "#1d4e89" });
    const id = createTask(db, { title: "Собрать кейс", notes: "Зона C", workerId: worker.id, workDate: "2026-10-12" }, "manager");
    expect(listTasks(db, "2026-10-12")).toMatchObject([{ id, progress: 0, status: "todo", workerName: "Илья", workerColor: "#1d4e89" }]);
    setTaskProgress(db, id, 50);
    expect(listTasks(db, "2026-10-12")[0]).toMatchObject({ progress: 50, status: "doing" });
    setTaskProgress(db, id, 100);
    const item = tasksToCalendarItems(listTasks(db))[0];
    expect(item).toMatchObject({ source: "task", taskId: id, color: "#1d4e89", progress: 100, startDate: "2026-10-12" });
  });

  it("не назначает скрытого работника и не принимает чужой цвет", () => {
    const db = createDb();
    const worker = createWorker(db, { name: "Олег", color: "#166534" });
    setWorkerActive(db, worker.id, false);
    expect(() => createTask(db, { title: "Выезд", workerId: worker.id, workDate: "2026-10-12" }, "manager")).toThrow(/Работник не найден/);
    expect(() => createWorker(db, { name: "Нина", color: "#ffffff" })).toThrow(/цвет/);
    expect(() => setTaskProgress(db, "нет", 10)).toThrow(/шагом 25%/);
  });
});
