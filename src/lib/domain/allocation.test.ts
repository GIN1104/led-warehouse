import { describe, expect, it } from "vitest";
import { allocateForSku, type DemandLine } from "@/lib/domain/allocation";

function line(partial: Partial<DemandLine> & Pick<DemandLine, "id" | "qtyRequested">): DemandLine {
  return {
    startDate: "2026-10-07",
    endDate: "2026-10-07",
    createdAt: 1,
    ...partial,
  };
}

describe("allocateForSku", () => {
  it("полностью резервирует заказ, если остатка хватает", () => {
    const [only] = allocateForSku(10, [line({ id: "a", qtyRequested: 4 })]);
    expect(only).toEqual({ id: "a", qtySoftReserved: 4, qtyShortage: 0 });
  });

  it("более ранний заказ забирает остаток в дни пересечения", () => {
    const result = allocateForSku(10, [
      line({ id: "a", qtyRequested: 8, createdAt: 1, startDate: "2026-10-01", endDate: "2026-10-03" }),
      line({ id: "b", qtyRequested: 8, createdAt: 2, startDate: "2026-10-03", endDate: "2026-10-05" }),
    ]);
    expect(result).toEqual([
      { id: "a", qtySoftReserved: 8, qtyShortage: 0 },
      { id: "b", qtySoftReserved: 2, qtyShortage: 6 },
    ]);
  });

  it("не смешивает непересекающиеся интервалы в один пул", () => {
    const result = allocateForSku(10, [
      line({ id: "a", qtyRequested: 10, createdAt: 1, startDate: "2026-10-01", endDate: "2026-10-02" }),
      line({ id: "b", qtyRequested: 10, createdAt: 2, startDate: "2026-10-10", endDate: "2026-10-12" }),
    ]);
    expect(result.every((row) => row.qtyShortage === 0 && row.qtySoftReserved === 10)).toBe(true);
  });

  it("при нулевом остатке вся заявка становится нехваткой", () => {
    const [only] = allocateForSku(0, [line({ id: "a", qtyRequested: 5 })]);
    expect(only).toEqual({ id: "a", qtySoftReserved: 0, qtyShortage: 5 });
  });

  it("сохраняет равенство резерва и нехватки запрошенному количеству", () => {
    const result = allocateForSku(7, [
      line({ id: "a", qtyRequested: 4, createdAt: 1 }),
      line({ id: "b", qtyRequested: 6, createdAt: 2 }),
    ]);
    for (const row of result) {
      const source = row.id === "a" ? 4 : 6;
      expect(row.qtySoftReserved + row.qtyShortage).toBe(source);
    }
  });
});
