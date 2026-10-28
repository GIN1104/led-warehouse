/** Упаковка LED-кабинетов в кейсы и площадь экрана. */

export type CabinetForm = "500x500" | "1000x500";

export type CabinetPackMetrics = {
  form: CabinetForm;
  cubes: number;
  /** м² экрана (кубики × площадь одного). */
  squareMeters: number;
  /** Шт в полном кейсе. */
  perCase: number;
  /** Число кейсов, округление вверх при неполном. */
  cases: number;
  cubeWidthMm: number;
  cubeHeightMm: number;
};

const FORMS: Record<
  CabinetForm,
  { perCase: number; widthMm: number; heightMm: number; m2: number }
> = {
  "500x500": { perCase: 8, widthMm: 500, heightMm: 500, m2: 0.25 },
  "1000x500": { perCase: 6, widthMm: 1000, heightMm: 500, m2: 0.5 },
};

/** Распознать форм-фактор по имени/коду/описанию (1000×500 важнее 500×500). */
export function detectCabinetForm(text: string): CabinetForm | null {
  const normalized = text.replace(/[xх×✕✖]/gi, "x").replace(/\s+/g, "").toLowerCase();
  if (/1000x500/.test(normalized) || /500x1000/.test(normalized)) return "1000x500";
  if (/500x500/.test(normalized)) return "500x500";
  return null;
}

export function cabinetPackMetrics(cubes: number, form: CabinetForm): CabinetPackMetrics {
  const qty = Math.max(0, Math.floor(Number.isFinite(cubes) ? cubes : 0));
  const spec = FORMS[form];
  return {
    form,
    cubes: qty,
    squareMeters: Math.round(qty * spec.m2 * 1000) / 1000,
    perCase: spec.perCase,
    cases: qty === 0 ? 0 : Math.ceil(qty / spec.perCase),
    cubeWidthMm: spec.widthMm,
    cubeHeightMm: spec.heightMm,
  };
}

export function cabinetPackFromText(cubes: number, text: string): CabinetPackMetrics | null {
  const form = detectCabinetForm(text);
  if (!form) return null;
  return cabinetPackMetrics(cubes, form);
}

/** Короткая подпись для UI: «12.5 м² · 50 куб. · 7 кейсов». */
export function formatCabinetPack(metrics: CabinetPackMetrics, labels?: { m2: string; cubes: string; cases: string }): string {
  const m2 = labels?.m2 ?? "м²";
  const cubes = labels?.cubes ?? "куб.";
  const cases = labels?.cases ?? "кейс.";
  const area = Number.isInteger(metrics.squareMeters)
    ? String(metrics.squareMeters)
    : metrics.squareMeters.toFixed(2).replace(/\.?0+$/, "");
  return `${area} ${m2} · ${metrics.cubes} ${cubes} · ${metrics.cases} ${cases}`;
}
