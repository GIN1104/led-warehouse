# Oracle Always Free — Docker API host

Полный RU runbook (аккаунт, клики Console, DNS, Variable, Pages):  
см. Project docs `oracle-always-free-api.md` (агентский store / координатор).

## Быстрый старт на уже созданной VM

```bash
# на Ubuntu aarch64 с Docker
cd deploy/oracle
cp .env.example .env
# заполнить API_DOMAIN, ACME_EMAIL, TURSO_* (не коммитить)
docker compose up -d --build
curl -fsS "https://$API_DOMAIN/api/v1/health/"
```

Затем GitHub Variable `NEXT_PUBLIC_ACCESS_API_BASE=https://<API_DOMAIN>` и rebuild Pages.

## OCI CLI

`../../scripts/oci-create-arm-vm.sh` + `oci.env` (из `oci.env.example`) — только если `oci` и `~/.oci` уже настроены.
