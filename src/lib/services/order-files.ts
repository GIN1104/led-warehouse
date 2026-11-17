/**
 * Файлы и ссылки к заказу (peer: view=files у выезда).
 * Сейчас — mock in-memory + валидация лимитов.
 * Точки для будущего ledger/API: listOrderFiles / saveOrderFiles / orderFilesApi.
 */

export const ORDER_FILES_MAX_COUNT = 10;
export const ORDER_FILES_MAX_BYTES_EACH = 8 * 1024 * 1024;
export const ORDER_FILES_MAX_BYTES_BATCH = 10 * 1024 * 1024;
export const ORDER_SHEET_LINKS_MAX = 10;

export type OrderFileKind = "image" | "pdf" | "sheet" | "other";

export type OrderAttachedFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: OrderFileKind;
  /** Локальный preview / будущий URL с API. */
  url: string | null;
  addedAt: number;
  /** Уже уходил в уведомление сотрудникам. */
  notified: boolean;
};

export type OrderFilesBundle = {
  orderId: string;
  equipmentList: string;
  files: OrderAttachedFile[];
  sheetLinks: string[];
  updatedAt: number;
};

export type OrderFilesSaveInput = {
  equipmentList: string;
  sheetLinksText: string;
  /** Новые файлы с клиента (FileList / массив). */
  newFiles?: Array<Pick<File, "name" | "type" | "size">>;
  /** id уже сохранённых файлов, которые нужно удалить. */
  removeFileIds?: string[];
  /** Отправить сотрудникам только новые/заменённые вложения. */
  notifyStaff?: boolean;
};

export type OrderFilesSaveResult = {
  bundle: OrderFilesBundle;
  notifiedFileIds: string[];
  notifiedLinks: string[];
  removedLinkSilent: boolean;
};

const store = new Map<string, OrderFilesBundle>();

function now() {
  return Date.now();
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function parseSheetLinks(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function inferFileKind(name: string, mimeType: string): OrderFileKind {
  const lower = name.toLowerCase();
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(lower)) return "image";
  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (mimeType.includes("sheet") || /\.(xlsx?|csv)$/.test(lower)) return "sheet";
  return "other";
}

export function validateNewFiles(
  existingCount: number,
  newFiles: Array<Pick<File, "name" | "type" | "size">>,
): string | null {
  if (existingCount + newFiles.length > ORDER_FILES_MAX_COUNT) {
    return `Не больше ${ORDER_FILES_MAX_COUNT} файлов на заказ`;
  }
  let batch = 0;
  for (const file of newFiles) {
    if (file.size > ORDER_FILES_MAX_BYTES_EACH) {
      return `Файл «${file.name}» больше 8 МБ`;
    }
    batch += file.size;
  }
  if (batch > ORDER_FILES_MAX_BYTES_BATCH) {
    return "Новые файлы вместе больше 10 МБ";
  }
  return null;
}

export function validateSheetLinks(links: string[]): string | null {
  if (links.length > ORDER_SHEET_LINKS_MAX) {
    return `Не больше ${ORDER_SHEET_LINKS_MAX} ссылок`;
  }
  for (const link of links) {
    if (!/^https?:\/\//i.test(link)) {
      return `Ссылка должна начинаться с http(s): ${link}`;
    }
  }
  return null;
}

function mockSeed(orderId: string): OrderFilesBundle {
  return {
    orderId,
    equipmentList: "Кабинеты 500×500 ×48\nПроцессор Novastar\nHDMI 15м ×4",
    files: [
      {
        id: "file_mock_plan",
        name: "17-11-2026_схема-сцены.png",
        mimeType: "image/png",
        sizeBytes: 420_000,
        kind: "image",
        url: null,
        addedAt: now() - 86_400_000,
        notified: true,
      },
      {
        id: "file_mock_rider",
        name: "17-11-2026_tech-rider.pdf",
        mimeType: "application/pdf",
        sizeBytes: 210_000,
        kind: "pdf",
        url: null,
        addedAt: now() - 43_200_000,
        notified: true,
      },
    ],
    sheetLinks: ["https://docs.google.com/spreadsheets/d/mock-packing-list/edit"],
    updatedAt: now() - 43_200_000,
  };
}

/** Чтение бандла (mock). Позже — GET /api/v1/orders/:id/files */
export function listOrderFiles(orderId: string): OrderFilesBundle {
  const existing = store.get(orderId);
  if (existing) return structuredClone(existing);
  const seeded = mockSeed(orderId);
  store.set(orderId, seeded);
  return structuredClone(seeded);
}

/** Сохранение (mock). Позже — PUT/POST multipart на ledger/API. */
export function saveOrderFiles(orderId: string, input: OrderFilesSaveInput): OrderFilesSaveResult {
  const current = listOrderFiles(orderId);
  const sheetLinks = parseSheetLinks(input.sheetLinksText);
  const linkError = validateSheetLinks(sheetLinks);
  if (linkError) throw new Error(linkError);

  const remove = new Set(input.removeFileIds ?? []);
  const kept = current.files.filter((file) => !remove.has(file.id));
  const incoming = input.newFiles ?? [];
  const fileError = validateNewFiles(kept.length, incoming);
  if (fileError) throw new Error(fileError);

  const added: OrderAttachedFile[] = incoming.map((file) => ({
    id: newId("file"),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    kind: inferFileKind(file.name, file.type || ""),
    url: null,
    addedAt: now(),
    notified: false,
  }));

  const prevLinks = new Set(current.sheetLinks);
  const nextLinks = new Set(sheetLinks);
  const addedOrReplacedLinks = sheetLinks.filter((link) => !prevLinks.has(link));
  const removedLinkSilent = [...prevLinks].some((link) => !nextLinks.has(link));

  const notify = Boolean(input.notifyStaff);
  const notifiedFileIds: string[] = [];
  const notifiedLinks: string[] = [];

  const files = [...kept, ...added].map((file) => {
    if (notify && !file.notified) {
      notifiedFileIds.push(file.id);
      return { ...file, notified: true };
    }
    return file;
  });

  if (notify) {
    for (const link of addedOrReplacedLinks) notifiedLinks.push(link);
  }

  const bundle: OrderFilesBundle = {
    orderId,
    equipmentList: input.equipmentList,
    files,
    sheetLinks,
    updatedAt: now(),
  };
  store.set(orderId, bundle);

  return {
    bundle: structuredClone(bundle),
    notifiedFileIds,
    notifiedLinks,
    removedLinkSilent,
  };
}

/**
 * Адаптер под будущий remote API.
 * Пока делегирует в mock; подмена — один раз в клиенте/сервере.
 */
export const orderFilesApi = {
  async list(orderId: string): Promise<OrderFilesBundle> {
    // TODO(api): return fetchJson(`${apiBase}/v1/orders/${orderId}/files`)
    return listOrderFiles(orderId);
  },
  async save(orderId: string, input: OrderFilesSaveInput): Promise<OrderFilesSaveResult> {
    // TODO(api): multipart FormData → POST `${apiBase}/v1/orders/${orderId}/files`
    return saveOrderFiles(orderId, input);
  },
};

/** Сброс mock-хранилища (тесты). */
export function resetOrderFilesStore() {
  store.clear();
}
