export type TextPart = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

/** Имя файла из URL Drive/прямого .xlsx (для подписи ссылки в карточке дня). */
export function driveLinkFileName(href: string): string | undefined {
  try {
    const url = new URL(href);
    const path = decodeURIComponent(url.pathname);
    const base = path.split("/").filter(Boolean).pop() ?? "";
    if (!base) return undefined;
    if (/\.(xlsx|xls|csv)$/i.test(base)) return base;
    // query ?title= / ?name= иногда в шаринге
    const titled = url.searchParams.get("title") ?? url.searchParams.get("name");
    if (titled && /\.(xlsx|xls|csv)$/i.test(titled)) return titled;
  } catch {
    return undefined;
  }
  return undefined;
}

/** Делит текст на обычные куски и ссылки http(s). Хвост вроде точки остаётся текстом. */
export function linkify(value: string): TextPart[] {
  const parts: TextPart[] = [];
  const pattern = new RegExp(URL_PATTERN);
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const raw = match[0];
    const href = raw.replace(/[)\].,;:!?]+$/g, "");
    const start = match.index;
    if (start > last) parts.push({ kind: "text", text: value.slice(last, start) });
    if (href) parts.push({ kind: "link", text: href, href });
    const tail = raw.slice(href.length);
    if (tail) parts.push({ kind: "text", text: tail });
    last = start + raw.length;
  }
  if (last < value.length) parts.push({ kind: "text", text: value.slice(last) });
  if (parts.length === 0) parts.push({ kind: "text", text: value });
  const merged: TextPart[] = [];
  for (const part of parts) {
    const prev = merged[merged.length - 1];
    if (part.kind === "text" && prev?.kind === "text") prev.text += part.text;
    else merged.push(part);
  }
  return merged;
}
