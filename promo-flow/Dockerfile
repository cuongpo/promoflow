FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dev-server.mjs api-routes.mjs capture.mjs generate.mjs ./
COPY dist ./dist

ENV NODE_ENV=production CHROME_BIN=/usr/bin/chromium
EXPOSE 8080
CMD ["node", "dev-server.mjs"]
