import { describe, expect, it } from "vitest";
import { backupDumpFileName, isBackupDumpName, parseBackupDumpName } from "@/lib/backup/naming";
import { keysToDeleteForRetention } from "@/lib/backup/retention";
import { assertBackupOwnerEmail, assertRestoreConfirm, isBackupOwnerEmail } from "@/lib/backup/owner";
import { getDriveBackupConfig, hasDriveBackupConfig } from "@/lib/backup/config";

describe("backup naming", () => {
  it("форматирует UTC-имя dump", () => {
    const name = backupDumpFileName(new Date(Date.UTC(2026, 10, 17, 21, 48)));
    expect(name).toBe("2026-11-17T21-48-ledvision.dump");
    expect(isBackupDumpName(name)).toBe(true);
    expect(parseBackupDumpName(name)?.toISOString()).toBe("2026-11-17T21:48:00.000Z");
  });
});

describe("backup retention", () => {
  it("держит 14 дней и один monthly старше", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    const items = [
      { key: "new", name: "2026-11-16T10-00-ledvision.dump" },
      { key: "old-oct-a", name: "2026-10-01T10-00-ledvision.dump" },
      { key: "old-oct-b", name: "2026-10-15T10-00-ledvision.dump" },
      { key: "old-sep", name: "2026-09-20T10-00-ledvision.dump" },
    ];
    const doomed = keysToDeleteForRetention(items, { now, keepDays: 14 });
    expect(doomed).toContain("old-oct-a");
    expect(doomed).not.toContain("new");
    expect(doomed).not.toContain("old-oct-b");
    expect(doomed).not.toContain("old-sep");
  });
});

describe("backup owner", () => {
  it("пускает только permanent owner", () => {
    expect(isBackupOwnerEmail("starchenkogin@gmail.com")).toBe(true);
    expect(isBackupOwnerEmail("ledvision2026.il@gmail.com")).toBe(false);
    expect(() => assertBackupOwnerEmail("ledvision2026.il@gmail.com")).toThrow(/владелец/);
    expect(() => assertRestoreConfirm("yes")).toThrow(/CONFIRM/);
    expect(() => assertRestoreConfirm("CONFIRM")).not.toThrow();
  });
});

describe("backup config", () => {
  it("без secrets — не configured", () => {
    expect(hasDriveBackupConfig({})).toBe(false);
    expect(getDriveBackupConfig({})).toBeNull();
  });

  it("собирает Drive из env", () => {
    expect(
      getDriveBackupConfig({
        GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"a@b","private_key":"x"}',
        GOOGLE_DRIVE_BACKUP_FOLDER_ID: "folder1",
      }),
    ).toEqual({
      serviceAccountJson: '{"client_email":"a@b","private_key":"x"}',
      folderId: "folder1",
    });
  });
});
