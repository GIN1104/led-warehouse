import { describe, expect, it } from "vitest";
import { mergePending } from "@/lib/email-auth/merge-pending";
import type { AccessRequestRow } from "@/lib/services/access-requests";

function row(partial: Partial<AccessRequestRow> & Pick<AccessRequestRow, "id" | "email">): AccessRequestRow {
  return {
    status: "pending",
    createdAt: 1,
    decidedBy: null,
    decidedAt: null,
    ...partial,
  };
}

describe("mergePending", () => {
  it("при remote !== null игнорирует локальный stale pending", () => {
    const local = [row({ id: "local", email: "a@x.com", createdAt: 99 })];
    const remote = [row({ id: "remote", email: "b@x.com", createdAt: 50 })];
    expect(mergePending(local, remote).map((item) => item.id)).toEqual(["remote"]);
  });

  it("без remote показывает локальные", () => {
    const local = [row({ id: "local", email: "a@x.com" })];
    expect(mergePending(local, null).map((item) => item.id)).toEqual(["local"]);
  });

  it("пустой remote → empty state", () => {
    const local = [row({ id: "local", email: "a@x.com" })];
    expect(mergePending(local, [])).toEqual([]);
  });
});
