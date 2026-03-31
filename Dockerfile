FROM node:22-slim
RUN npm install -g pnpm
WORKDIR /app

# Install dependencies
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY server/package.json ./server/
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY server/ ./server/
COPY pipelines/ ./pipelines/
COPY skills/ ./skills/

# Generate migrations if not already committed
RUN pnpm db:generate || true

EXPOSE 3009

# Use tsx directly — avoids compiled workspace resolution complexity
CMD ["pnpm", "--filter", "server", "exec", "tsx", "src/index.ts"]
