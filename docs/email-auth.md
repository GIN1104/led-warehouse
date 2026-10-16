# Авторизация по email (LED Warehouse)

Документ фиксирует research, выбранный MVP и путь к «настоящему» email без поломки mapper / Google Calendar.

Связано: [architecture-plan.md](./architecture-plan.md), сайт [Pages](https://GIN1104.github.io/led-warehouse/).

---

## 1. Research: magic link / OTP / passwordless

| Вариант | Pages (static SPA) | Docker/BFF | Секреты | Скорость MVP |
|---------|--------------------|------------|---------|--------------|
| **Password + cookie session** | Нужен backend | Ок | hashing на сервере | медленно |
| **Magic link (Resend/SMTP)** | Нужен провайдер или BFF | Ок | API key | средне |
| **Email OTP (код 6 цифр)** | Мок кода на клиенте возможен | Ок | API key только для реальной доставки | **быстро** |
| **Firebase / Supabase Auth** | Работает со SPA | Ок | project keys | внешняя зависимость |
| **Google Sign-In как единственный вход** | GIS | Ок | Client ID уже есть | путает с Calendar OAuth |

### Вердикт MVP

**Email OTP + allowlist из справочника People.**

На **GitHub Pages** (нет Node API):

1. Пользователь вводит email.
2. Email в allowlist: поле `users.email` **или** bootstrap-адреса демо-сотрудников.
3. OTP в браузере (sessionStorage), код **показывается на экране** (mock).
4. Сессия в `localStorage` (`led-warehouse:email-auth`).
5. Без сессии → `/login`.

На **Docker / `npm run dev`**: тот же клиент; Route Handler `/api/v1/auth/otp` при `RESEND_API_KEY` шлёт письмо, иначе `{ mode: "mock", code }`.

---

## 2. Что не ломаем

| Интеграция | Как остаётся |
|------------|--------------|
| Excel import (mapper, HE glossary, reserved) | После логина, без session cookie |
| Google Calendar Connect | Отдельный GIS-токен; logout email его не трогает |
| Mapper HTTP / ledger API | Без cookie, как раньше |

---

## 3. People и bootstrap

- Колонка `users.email`.
- Seed: `alexey@led.local`, `dmitry@led.local`.
- На `/people` email редактируется → allowlist.

## 4. Что нужно от пользователя

| Когда | Что |
|-------|-----|
| **Сейчас** | Ничего (mock OTP) |
| Реальные письма (Docker) | `RESEND_API_KEY` (+ опционально `AUTH_FROM_EMAIL`) в env, не в git |
| **Не просим** | Пароль Google; Client Secret в репо |
