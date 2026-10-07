export const roleLabel = {
  warehouse: "Склад",
  logistics: "Логистика",
  manager: "Менеджер",
  admin: "Администратор",
} as const;

export const orderStatusLabel = {
  confirmed: "Подтверждён",
  cancelled: "Отменён",
  closed: "Закрыт",
} as const;

export const hireStatusLabel = {
  needed: "Нужно арендовать",
  ordered: "Заказано снаружи",
  received: "Получено",
  closed: "Закрыто",
} as const;

export const alertStatusLabel = {
  open: "Открыт",
  ack: "Принят",
  closed: "Закрыт",
} as const;

export const movementLabel = {
  in: "Приход",
  out: "Расход",
  adjust: "Корректировка",
  move: "Перемещение",
} as const;

export const locationKindLabel = {
  warehouse: "Склад",
  zone: "Зона",
  bin: "Ячейка",
} as const;
