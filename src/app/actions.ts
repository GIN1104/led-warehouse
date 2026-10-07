"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { assertCan, getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { DomainError } from "@/lib/domain/errors";
import {
  ackAlert,
  applyMovement,
  createLocation,
  createOrder,
  createSku,
  ingestScan,
  setHireStatus,
  setOrderStatus,
  type MovementType,
} from "@/lib/services/ledger";

export type ActionState = { error: string } | null;

function fail(path: string, error: unknown): never {
  const message = error instanceof DomainError ? error.message : "Не удалось сохранить";
  if (!(error instanceof DomainError)) console.error(error);
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function switchUser(formData: FormData): Promise<void> {
  const userId = String(formData.get("userId") ?? "");
  const user = getDb().select().from(users).where(eq(users.id, userId)).get();
  if (!user) return;
  const jar = await cookies();
  jar.set("lw_user", user.id, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

export async function createSkuAction(formData: FormData): Promise<void> {
  const back = "/catalog";
  try {
    const session = await getSession();
    assertCan(session.role, "catalog.write");
    createSku(
      getDb(),
      {
        code: String(formData.get("code") ?? ""),
        name: String(formData.get("name") ?? ""),
        category: String(formData.get("category") ?? ""),
        unit: String(formData.get("unit") ?? ""),
        description: String(formData.get("description") ?? ""),
      },
      session.id,
    );
  } catch (error) {
    unstable_rethrow(error);
    fail(back, error);
  }
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent("Позиция добавлена")}`);
}

export async function createLocationAction(formData: FormData): Promise<void> {
  const back = "/locations";
  try {
    const session = await getSession();
    assertCan(session.role, "location.write");
    const kind = String(formData.get("kind") ?? "zone");
    if (kind !== "warehouse" && kind !== "zone" && kind !== "bin") {
      throw new DomainError("Неизвестный тип локации");
    }
    createLocation(
      getDb(),
      {
        name: String(formData.get("name") ?? ""),
        kind,
        parentId: String(formData.get("parentId") ?? "") || undefined,
      },
      session.id,
    );
  } catch (error) {
    unstable_rethrow(error);
    fail(back, error);
  }
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent("Локация добавлена")}`);
}

export async function movementAction(formData: FormData): Promise<void> {
  const back = "/stock";
  try {
    const session = await getSession();
    assertCan(session.role, "stock.write");
    const type = String(formData.get("type") ?? "in");
    if (type !== "in" && type !== "out" && type !== "adjust" && type !== "move") {
      throw new DomainError("Неизвестный тип движения");
    }
    applyMovement(
      getDb(),
      {
        skuId: String(formData.get("skuId") ?? ""),
        type: type as MovementType,
        qty: Number(formData.get("qty")),
        locationId: String(formData.get("locationId") ?? ""),
        fromLocationId: String(formData.get("fromLocationId") ?? "") || undefined,
        reason: String(formData.get("reason") ?? ""),
      },
      session.id,
    );
  } catch (error) {
    unstable_rethrow(error);
    fail(back, error);
  }
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent("Движение проведено")}`);
}

export async function createOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await getSession();
    assertCan(session.role, "order.write");
    const raw = JSON.parse(String(formData.get("lines") ?? "[]")) as { skuId?: string; qty?: number }[];
    const lines = raw.map((line) => ({ skuId: String(line.skuId ?? ""), qty: Number(line.qty) }));
    const result = createOrder(
      getDb(),
      {
        customerName: String(formData.get("customerName") ?? ""),
        startDate: String(formData.get("startDate") ?? ""),
        endDate: String(formData.get("endDate") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        lines,
      },
      session.id,
    );
    revalidatePath("/orders");
    redirect(`/orders/${result.orderId}`);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof DomainError) return { error: error.message };
    console.error(error);
    return { error: "Не удалось сохранить заказ" };
  }
}

export async function orderStatusAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get("orderId") ?? "");
  const back = `/orders/${orderId}`;
  try {
    const session = await getSession();
    assertCan(session.role, "order.write");
    const status = String(formData.get("status") ?? "");
    if (status !== "cancelled" && status !== "closed") throw new DomainError("Неизвестный статус заказа");
    setOrderStatus(getDb(), orderId, status, session.id);
  } catch (error) {
    unstable_rethrow(error);
    fail(back, error);
  }
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent("Статус заказа обновлён")}`);
}

export async function scanAction(formData: FormData): Promise<void> {
  const back = "/scan";
  try {
    const session = await getSession();
    assertCan(session.role, "scan.write");
    const direction = String(formData.get("direction") ?? "in");
    if (direction !== "in" && direction !== "out" && direction !== "move") {
      throw new DomainError("Неизвестное направление скана");
    }
    const result = ingestScan(
      getDb(),
      {
        eventId: String(formData.get("eventId") || randomUUID()),
        source: "ui",
        code: String(formData.get("code") ?? ""),
        direction,
        qty: Number(formData.get("qty") ?? 1),
        locationId: String(formData.get("locationId") ?? "") || undefined,
        fromLocationId: String(formData.get("fromLocationId") ?? "") || undefined,
      },
      session.id,
    );
    revalidatePath(back);
    if (result.status === "rejected") {
      redirect(`${back}?error=${encodeURIComponent(result.reason ?? "Скан отклонён")}`);
    }
    redirect(`${back}?ok=${encodeURIComponent("Скан принят, остаток обновлён")}`);
  } catch (error) {
    unstable_rethrow(error);
    fail(back, error);
  }
}

export async function hireStatusAction(formData: FormData): Promise<void> {
  const back = "/external-hires";
  try {
    const session = await getSession();
    assertCan(session.role, "hire.write");
    const status = String(formData.get("status") ?? "");
    if (status !== "needed" && status !== "ordered" && status !== "received" && status !== "closed") {
      throw new DomainError("Неизвестный статус аренды");
    }
    setHireStatus(getDb(), String(formData.get("id") ?? ""), status, String(formData.get("supplierNote") ?? ""), session.id);
  } catch (error) {
    unstable_rethrow(error);
    fail(back, error);
  }
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent("Внешняя аренда обновлена")}`);
}

export async function ackAlertAction(formData: FormData): Promise<void> {
  const back = "/alerts";
  try {
    const session = await getSession();
    assertCan(session.role, "alert.write");
    ackAlert(getDb(), String(formData.get("id") ?? ""), session.id);
  } catch (error) {
    unstable_rethrow(error);
    fail(back, error);
  }
  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent("Сигнал принят")}`);
}
