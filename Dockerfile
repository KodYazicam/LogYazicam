FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY src ./src
COPY LICENSE README.md ./
RUN useradd --uid 10001 --create-home logyazicam
USER 10001
ENV NODE_ENV=production
VOLUME ["/app/data"]
CMD ["node", "src/index.js"]
