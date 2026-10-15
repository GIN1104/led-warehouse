/** Статусы qty-строки оборудования (без серийников). */
export const EQUIPMENT_STATUSES = [
  "available",
  "reserved",
  "checked_out",
  "needs_repair",
  "in_repair",
] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

/** Допустимые ручные переходы без сканера. */
export const EQUIPMENT_TRANSITIONS: Record<EquipmentStatus, readonly EquipmentStatus[]> = {
  available: ["reserved", "checked_out", "needs_repair", "in_repair"],
  reserved: ["checked_out", "available", "needs_repair"],
  checked_out: ["available", "needs_repair", "in_repair"],
  needs_repair: ["in_repair", "available"],
  in_repair: ["available", "needs_repair"],
};

export function isEquipmentStatus(value: string): value is EquipmentStatus {
  return (EQUIPMENT_STATUSES as readonly string[]).includes(value);
}

export function canTransitionEquipment(from: EquipmentStatus, to: EquipmentStatus): boolean {
  if (from === to) return false;
  return EQUIPMENT_TRANSITIONS[from].includes(to);
}
