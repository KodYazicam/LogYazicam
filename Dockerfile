FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY LICENSE README.md ./
RUN useradd --uid 10001 --create-home logyazicam \
    && mkdir -p /app/data \
    && chown -R 10001:10001 /app/data
USER 10001
ENV NODE_ENV=production
VOLUME ["/app/data"]
CMD ["node", "src/index.js"]
