import { Suspense } from "react";
import { OrderView } from "@/app/orders/view/order-view";

export default function OrderViewPage() {
  return (
    <Suspense fallback={<p className="text-sm">Загрузка заказа…</p>}>
      <OrderView />
    </Suspense>
  );
}
