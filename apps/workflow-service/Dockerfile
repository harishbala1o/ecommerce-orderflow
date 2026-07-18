# Build context is the monorepo root.
# ---- build stage ----
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @ecommerce-orderflow/domain build \
 && pnpm --filter @ecommerce-orderflow/workflow-service build \
 && pnpm deploy --filter=@ecommerce-orderflow/workflow-service --prod /app

# ---- runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3001
CMD ["node", "dist/main.js"]
