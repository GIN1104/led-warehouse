import { afterEach, describe, expect, it } from "vitest";
import {
  allowBackupMock,
  assertDriveBackupConfigured,
  DRIVE_BACKUP_ACCOUNT_EMAIL,
  getDriveBackupConfig,
} from "@/lib/backup/config";

describe("backup Drive config", () => {
  afterEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;
    delete process.env.NEXT_PUBLIC_SHARED;
    delete process.env.ALLOW_BACKUP_MOCK;
  });

  it("целевая папка — Drive ledvision2026", () => {
    expect(DRIVE_BACKUP_ACCOUNT_EMAIL).toBe("ledvision2026.il@gmail.com");
  });

  it("shared host без secrets: mock запрещён, assert бросает", () => {
    process.env.NEXT_PUBLIC_SHARED = "1";
    expect(allowBackupMock()).toBe(false);
    expect(getDriveBackupConfig()).toBeNull();
    expect(() => assertDriveBackupConfigured()).toThrow(/ledvision2026\.il@gmail\.com/);
  });

  it("ALLOW_BACKUP_MOCK=1 разрешает mock даже на shared", () => {
    process.env.NEXT_PUBLIC_SHARED = "1";
    process.env.ALLOW_BACKUP_MOCK = "1";
    expect(allowBackupMock()).toBe(true);
    expect(() => assertDriveBackupConfigured()).not.toThrow();
  });

  it("оба secrets → live config", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = '{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"k"}';
    process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID = "folder123";
    process.env.NEXT_PUBLIC_SHARED = "1";
    expect(getDriveBackupConfig()).toEqual({
      serviceAccountJson: '{"client_email":"sa@x.iam.gserviceaccount.com","private_key":"k"}',
      folderId: "folder123",
    });
    expect(() => assertDriveBackupConfigured()).not.toThrow();
  });
});
