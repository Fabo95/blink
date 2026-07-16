# The sync API has zero runtime dependencies — Node built-ins only, and the
# @blink/* imports are type-only (erased by Node's native TS stripping). So the
# image is just Node + the source. Build context is the repo root.
FROM node:24-alpine

WORKDIR /app
COPY apps/sync-server/src ./src

EXPOSE 8787
CMD ["node", "src/index.ts"]
