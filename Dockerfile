# One image for every deployment, the operator's cloud included (ADR-002 D4): the service
# serves the API, the websockets and the built SPA from a single origin.

FROM node:22-slim AS build

WORKDIR /app

# better-sqlite3 compiles from source when no prebuilt binary matches the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY service/package*.json ./service/
RUN npm --prefix service ci

COPY web/package*.json ./web/
RUN npm --prefix web ci

COPY service ./service
RUN npm --prefix service run build && npm --prefix service prune --omit=dev

COPY web ./web
RUN npm --prefix web run build

FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_FILE=/data/pit-stop.db \
    WEB_DIST=/app/web/dist

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

# Optional continuous replication of the SQLite file (ADR-001 D3), enabled by configuration.
COPY --from=litestream/litestream:0.3.13 /usr/local/bin/litestream /usr/local/bin/litestream

# Native modules were compiled in the build stage against this same base image.
COPY --from=build /app/service/package.json ./service/package.json
COPY --from=build /app/service/node_modules ./service/node_modules
COPY --from=build /app/service/dist ./service/dist
COPY --from=build /app/web/dist ./web/dist
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && mkdir -p /data

VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://localhost:${PORT}/health" || exit 1

CMD ["/app/entrypoint.sh"]
