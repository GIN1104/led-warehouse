import { Suspense } from "react";
import { OrderFallback, OrderView } from "@/app/orders/view/order-view";

export default function OrderViewPage() {
  return (
    <Suspense fallback={<OrderFallback />}>
      <OrderView />
    </Suspense>
  );
}
