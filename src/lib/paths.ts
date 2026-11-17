export function orderHref(id: string): string {
  return `/orders/view/?id=${encodeURIComponent(id)}`;
}

/** Файлы и ссылки к заказу (peer view=files). */
export function filesHref(orderId?: string): string {
  if (!orderId) return "/files/";
  return `/files/?orderId=${encodeURIComponent(orderId)}`;
}
