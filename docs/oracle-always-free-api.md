# Oracle Cloud Always Free — API host

Краткая копия для репозитория. Полный RU runbook с кликами Console и блокерами — в Project docs координатора: `docs/oracle-always-free-api.md` (store).

## Суть

1. Always Free **ARM** VM (`VM.Standard.A1.Flex`) + Ingress **22/80/443**.
2. На VM: `scripts/oracle-bootstrap.sh` → `deploy/oracle` (`docker compose` + Caddy TLS + Turso).
3. DNS A → public IP; `API_DOMAIN` в `.env`.
4. GitHub Variable `NEXT_PUBLIC_ACCESS_API_BASE=https://<API_DOMAIN>` → rebuild Pages.
5. Секреты только в `deploy/oracle/.env` на VM — не в git/чате.

## Helpers

| Путь | Назначение |
|------|------------|
| `deploy/oracle/docker-compose.yml` | warehouse:8080 + Caddy 80/443 |
| `deploy/oracle/Caddyfile` | reverse_proxy + ACME |
| `deploy/oracle/.env.example` | шаблон без секретов |
| `scripts/oracle-bootstrap.sh` | Docker на Ubuntu |
| `scripts/oci-create-arm-vm.sh` | create VM **если** есть `oci` + `~/.oci` + `oci.env` |

## Блокер

Без аккаунта OCI / верификации / CLI создать VM нельзя. Fly больше не используем (trial ended). Turso остаётся.
