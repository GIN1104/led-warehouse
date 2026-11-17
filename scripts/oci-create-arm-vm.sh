#!/usr/bin/env bash
# Создаёт Always Free A1.Flex VM, если OCI CLI уже настроен.
# Использование (с ПК):
#   cp deploy/oracle/oci.env.example deploy/oracle/oci.env  # заполнить
#   ./scripts/oci-create-arm-vm.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${OCI_ENV_FILE:-$ROOT/deploy/oracle/oci.env}"

if ! command -v oci >/dev/null 2>&1; then
  cat <<'EOF' >&2
OCI CLI не найден (команда `oci`).

Сделайте вручную:
  1) https://cloud.oracle.com — Sign up / Always Free (часто нужна верификация карты)
  2) Установите OCI CLI и положите ~/.oci/config + API key
  3) Создайте VCN + public subnet + Ingress 22/80/443 (см. docs/oracle runbook)
  4) Заполните deploy/oracle/oci.env и снова запустите этот скрипт

Пока CLI/кредов нет — VM агентом создать нельзя.
EOF
  exit 2
fi

if [[ ! -f "$HOME/.oci/config" ]]; then
  echo "Нет $HOME/.oci/config — настройте API key в Console → User Settings." >&2
  exit 2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Нет $ENV_FILE — скопируйте oci.env.example → oci.env и заполните OCID." >&2
  exit 2
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

: "${COMPARTMENT_ID:?}"
: "${SUBNET_ID:?}"
: "${AVAILABILITY_DOMAIN:?}"
: "${IMAGE_ID:?}"
: "${SSH_PUBLIC_KEY_PATH:?}"

DISPLAY_NAME="${DISPLAY_NAME:-led-warehouse-api}"
SHAPE="${SHAPE:-VM.Standard.A1.Flex}"
OCPUS="${OCPUS:-1}"
MEMORY_IN_GBS="${MEMORY_IN_GBS:-6}"
SSH_PUBLIC_KEY_PATH="${SSH_PUBLIC_KEY_PATH/#\~/$HOME}"

if [[ ! -f "$SSH_PUBLIC_KEY_PATH" ]]; then
  echo "SSH public key не найден: $SSH_PUBLIC_KEY_PATH" >&2
  exit 2
fi

echo "==> oci session (tenancy)"
oci iam region list --output table >/dev/null

SHAPE_CONFIG="{\"ocpus\": ${OCPUS}, \"memoryInGBs\": ${MEMORY_IN_GBS}}"

echo "==> Create instance $DISPLAY_NAME ($SHAPE ${OCPUS} OCPU / ${MEMORY_IN_GBS} GB)"
oci compute instance launch \
  --compartment-id "$COMPARTMENT_ID" \
  --availability-domain "$AVAILABILITY_DOMAIN" \
  --display-name "$DISPLAY_NAME" \
  --shape "$SHAPE" \
  --shape-config "$SHAPE_CONFIG" \
  --image-id "$IMAGE_ID" \
  --subnet-id "$SUBNET_ID" \
  --assign-public-ip true \
  --metadata "{\"ssh_authorized_keys\": \"$(tr -d '\n' <"$SSH_PUBLIC_KEY_PATH")\"}" \
  --wait-for-state RUNNING \
  --query 'data.{id:id,state:"lifecycle-state"}' \
  --output table

INSTANCE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT_ID" \
  --display-name "$DISPLAY_NAME" \
  --lifecycle-state RUNNING \
  --query 'data[0].id' \
  --raw-output)"

PUBLIC_IP="$(oci compute instance list-vnics \
  --instance-id "$INSTANCE_ID" \
  --query 'data[0]."public-ip"' \
  --raw-output)"

echo "Public IP: $PUBLIC_IP"
echo "Дальше: DNS A → IP, SSH, scripts/oracle-bootstrap.sh, deploy/oracle compose."
echo "Не забудьте Ingress TCP 22/80/443 на Security List / NSG."
