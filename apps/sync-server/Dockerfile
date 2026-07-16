# Build context is the repo root. The server runs as native TS (Node strips
# types), but now depends on @blink/db, which is compiled to JS. So: install the
# server's subgraph, build @blink/db, then run.
FROM node:24-alpine

WORKDIR /app
RUN corepack enable

COPY . .
# `@blink/sync-server...` = the server + its dependency graph; the extra
# `@blink/db` filter pulls in its devDeps (typescript) so the build step works.
RUN pnpm install --frozen-lockfile --filter "@blink/sync-server..." --filter @blink/db \
  && pnpm --filter @blink/db build

WORKDIR /app/apps/sync-server
EXPOSE 8787
CMD ["node", "src/index.ts"]
