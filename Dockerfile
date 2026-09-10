FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @shorts-os/web build && pnpm --filter @shorts-os/worker build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl fonts-noto-cjk fontconfig \
    && fc-cache -f && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@10.33.3 --activate
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data/media && chown -R node:node /data
USER node
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 MEDIA_ROOT=/data/media
EXPOSE 43117
CMD ["pnpm", "--filter", "@shorts-os/web", "start"]
