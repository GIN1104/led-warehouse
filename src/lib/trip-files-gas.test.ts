import { afterEach, describe, expect, it } from "vitest";
import { tripFilesGasExecBase, tripFilesGasHref } from "@/lib/trip-files-gas";

const ENV_KEY = "NEXT_PUBLIC_TRIP_FILES_GAS_EXEC_URL";

describe("trip-files-gas", () => {
  const prev = process.env[ENV_KEY];

  afterEach(() => {
    if (prev === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = prev;
  });

  it("без env возвращает null href", () => {
    delete process.env[ENV_KEY];
    expect(tripFilesGasExecBase()).toBe("");
    expect(tripFilesGasHref("order-1")).toBeNull();
  });

  it("собирает ?trip=&view=files", () => {
    process.env[ENV_KEY] = "https://script.google.com/macros/s/ABC/exec/";
    expect(tripFilesGasHref("ord-42")).toBe(
      "https://script.google.com/macros/s/ABC/exec?trip=ord-42&view=files",
    );
  });
});
