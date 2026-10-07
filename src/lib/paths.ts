export function orderHref(id: string): string {
  return `/orders/view/?id=${encodeURIComponent(id)}`;
}
