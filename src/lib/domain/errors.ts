/** Ожидаемая ошибка предметной области: её текст можно показать пользователю. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
