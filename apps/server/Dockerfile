# Build context is the repo root. Builds the workspace deps (@blink/contract,
# @blink/db) + the Fastify server to JS, then runs the compiled output.
FROM node:24-alpine

WORKDIR /app
RUN corepack enable

COPY . .
# `@blink/server...` = server + dependency graph; the extra filters pull in
# each built dep's devDeps (typescript) for its build step.
RUN pnpm install --frozen-lockfile --filter "@blink/server..." --filter @blink/contract --filter @blink/db \
  && pnpm --filter @blink/contract build \
  && pnpm --filter @blink/db build \
  && pnpm --filter @blink/server build

WORKDIR /app/apps/server
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "dist/index.js"]
