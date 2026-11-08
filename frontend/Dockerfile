# Build the static app, then serve it with an unprivileged nginx that also proxies /api.
FROM node:24-bookworm-slim AS build
RUN npm install --global pnpm@12.18.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Real API for everything it serves; sample data only for later-phase features
ENV VITE_USE_MOCKS=false \
    VITE_FEATURE_ASK=true
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
