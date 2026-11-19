import { afterEach, describe, expect, it } from "vitest";
import { tripFilesGasExecBase, tripFilesGasHref } from "@/lib/trip-files-gas";

const FILES_KEY = "NEXT_PUBLIC_TRIP_FILES_GAS_EXEC_URL";
const TRIPS_KEY = "NEXT_PUBLIC_LED_TRIPS_GAS_EXEC_URL";

describe("trip-files-gas", () => {
  const prevFiles = process.env[FILES_KEY];
  const prevTrips = process.env[TRIPS_KEY];

  afterEach(() => {
    if (prevFiles === undefined) delete process.env[FILES_KEY];
    else process.env[FILES_KEY] = prevFiles;
    if (prevTrips === undefined) delete process.env[TRIPS_KEY];
    else process.env[TRIPS_KEY] = prevTrips;
  });

  it("без env возвращает null href", () => {
    delete process.env[FILES_KEY];
    delete process.env[TRIPS_KEY];
    expect(tripFilesGasExecBase()).toBe("");
    expect(tripFilesGasHref("order-1")).toBeNull();
  });

  it("собирает ?trip=&view=files из trip-files", () => {
    delete process.env[TRIPS_KEY];
    process.env[FILES_KEY] = "https://script.google.com/macros/s/ABC/exec/";
    expect(tripFilesGasHref("ord-42")).toBe(
      "https://script.google.com/macros/s/ABC/exec?trip=ord-42&view=files",
    );
  });

  it("предпочитает LED_TRIPS над TRIP_FILES", () => {
    process.env[FILES_KEY] = "https://script.google.com/macros/s/FILES/exec";
    process.env[TRIPS_KEY] = "https://script.google.com/macros/s/TRIPS/exec";
    expect(tripFilesGasExecBase()).toBe(
      "https://script.google.com/macros/s/TRIPS/exec",
    );
    expect(tripFilesGasHref("x")).toBe(
      "https://script.google.com/macros/s/TRIPS/exec?trip=x&view=files",
    );
  });
});
