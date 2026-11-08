/** Цель для внешних карт: адрес и/или координаты. Без встроенного GIS. */

export type MapTarget = {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type MapsLinks = {
  google: string;
  apple: string;
  osm: string;
};

export function hasMapTarget(target: MapTarget): boolean {
  if (
    target.lat != null &&
    target.lng != null &&
    Number.isFinite(target.lat) &&
    Number.isFinite(target.lng)
  ) {
    return true;
  }
  return Boolean(target.address?.trim());
}

/** Ссылки Google Maps / Apple Maps / OpenStreetMap по адресу или lat/lng. */
export function mapsLinks(target: MapTarget): MapsLinks | null {
  if (!hasMapTarget(target)) return null;

  if (
    target.lat != null &&
    target.lng != null &&
    Number.isFinite(target.lat) &&
    Number.isFinite(target.lng)
  ) {
    const lat = target.lat;
    const lng = target.lng;
    return {
      google: `https://www.google.com/maps?q=${lat},${lng}`,
      apple: `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(`${lat},${lng}`)}`,
      osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`,
    };
  }

  const q = encodeURIComponent(target.address!.trim());
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    apple: `https://maps.apple.com/?q=${q}`,
    osm: `https://www.openstreetmap.org/search?query=${q}`,
  };
}

/** Предпочтительная карта: Apple на Apple-устройствах, иначе Google. */
export function preferredMapUrl(
  target: MapTarget,
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
): string | null {
  const links = mapsLinks(target);
  if (!links) return null;
  if (/iPhone|iPad|iPod|Macintosh/i.test(userAgent)) return links.apple;
  return links.google;
}
