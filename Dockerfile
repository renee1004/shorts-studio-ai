FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @shorts-os/web build && pnpm --filter @shorts-os/worker build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl fonts-noto-cjk fontconfig python3 python3-venv \
    && fc-cache -f && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@10.33.3 --activate
RUN python3 -m venv /opt/notebooklm && /opt/notebooklm/bin/pip install --no-cache-dir notebooklm-py==0.8.2
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data/media && chown -R node:node /data
USER node
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 MEDIA_ROOT=/data/media
ENV NOTEBOOKLM_PYTHON=/opt/notebooklm/bin/python NOTEBOOKLM_BRIDGE_SCRIPT=/app/scripts/notebooklm_bridge.py NOTEBOOKLM_STORAGE_ROOT=/data/notebooklm
EXPOSE 43117
CMD ["pnpm", "--filter", "@shorts-os/web", "start"]
