# Build context is the repo root. Builds @blink/web (Vite static output) and
# serves it with stock nginx. VITE_DOWNLOADS_BASE_URL is baked in at build time
# (Vite inlines VITE_* into the bundle), so it's a build-arg, not a runtime env.
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable

ARG VITE_DOWNLOADS_BASE_URL
ENV VITE_DOWNLOADS_BASE_URL=$VITE_DOWNLOADS_BASE_URL

COPY . .
# `@blink/web...` = web + its workspace deps (@blink/core, which ships raw TS).
RUN pnpm install --frozen-lockfile --filter "@blink/web..." \
  && pnpm --filter @blink/web build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
