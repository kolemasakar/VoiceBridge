FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM node:24-bookworm-slim AS pot-build

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates git python3 make g++ pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg62-turbo-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/bgutil-src
RUN git clone --depth 1 --branch 1.3.1 \
  https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git .

WORKDIR /opt/bgutil-src/server
RUN npm ci --no-audit --no-fund && npx tsc

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PATH="/opt/ytdlp/bin:${PATH}"
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates python3 python3-venv ffmpeg \
    libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/ytdlp \
  && /opt/ytdlp/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/ytdlp/bin/pip install --no-cache-dir \
    "yt-dlp[default]==2026.07.04" \
    "bgutil-ytdlp-pot-provider==1.3.1"

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=pot-build /opt/bgutil-src/server/build /opt/bgutil/build
COPY --from=pot-build /opt/bgutil-src/server/node_modules /opt/bgutil/node_modules
COPY --from=pot-build /opt/bgutil-src/server/package.json /opt/bgutil/package.json

EXPOSE 8080

USER node

CMD ["sh", "-c", "node /opt/bgutil/build/main.js --port 4416 >/tmp/bgutil-provider.log 2>&1 & sleep 1; exec node dist/src/index.js"]
