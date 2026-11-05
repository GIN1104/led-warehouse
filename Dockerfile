FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Bake shared client for Fly API host (Pages stays static with SHARED="").
ENV NEXT_PUBLIC_SHARED=1
RUN npm run build

ENV NODE_ENV=production
ENV LEDGER_PATH=/data/warehouse.sqlite
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
VOLUME /data
EXPOSE 8080
CMD ["npm", "start"]
