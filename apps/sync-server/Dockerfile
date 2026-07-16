# Build context is the repo root. Builds @blink/db + the Fastify server to JS,
# then runs the compiled output.
FROM node:24-alpine

WORKDIR /app
RUN corepack enable

COPY . .
# `@blink/sync-server...` = server + dependency graph; the extra `@blink/db`
# filter pulls in its devDeps (typescript) for the build step.
RUN pnpm install --frozen-lockfile --filter "@blink/sync-server..." --filter @blink/db \
  && pnpm --filter @blink/db build \
  && pnpm --filter @blink/sync-server build

WORKDIR /app/apps/sync-server
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "dist/index.js"]
