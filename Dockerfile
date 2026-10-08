FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_PUBLIC_SHARED=1
RUN npm run build

ENV NODE_ENV=production
ENV LEDGER_PATH=/data/warehouse.sqlite
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
