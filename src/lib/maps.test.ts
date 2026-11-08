import { describe, expect, it } from "vitest";
import { hasMapTarget, mapsLinks, preferredMapUrl } from "@/lib/maps";

describe("mapsLinks", () => {
  it("строит ссылки по координатам", () => {
    const links = mapsLinks({ lat: 32.08, lng: 34.78 });
    expect(links?.google).toContain("32.08,34.78");
    expect(links?.apple).toContain("ll=32.08,34.78");
    expect(links?.osm).toContain("mlat=32.08");
  });

  it("строит ссылки по адресу", () => {
    const links = mapsLinks({ address: "Tel Aviv Port" });
    expect(links?.google).toContain(encodeURIComponent("Tel Aviv Port"));
    expect(links?.apple).toContain("q=");
    expect(links?.osm).toContain("query=");
  });

  it("пустая цель — null", () => {
    expect(hasMapTarget({})).toBe(false);
    expect(mapsLinks({ address: "  " })).toBeNull();
    expect(preferredMapUrl({})).toBeNull();
  });

  it("на iPhone предпочитает Apple Maps", () => {
    const url = preferredMapUrl({ address: "Haifa" }, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)");
    expect(url).toContain("maps.apple.com");
  });
});
