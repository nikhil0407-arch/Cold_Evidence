# syntax=docker/dockerfile:1

# --- Cold Evidence — production image -------------------------------------
# @supabase/supabase-js needs Node >=22, and undici (a sub-dependency)
# specifically needs >=22.19 — don't swap this for an older "node:18/20-*"
# base without checking those package.json "engines" fields again.
FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

# Copy only the manifest files first so this layer is cached by Docker/Podman
# and only reinstalls when a dependency actually changes, not on every
# source edit.
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --omit=dev --prefix backend && npm cache clean --force

# Now bring in the rest of the source. server.js locates its templates and
# static assets with path.join(__dirname, '../views') / '../public', so this
# folder layout (backend, public, views as siblings) has to be preserved
# exactly as it is in the repo — don't flatten it.
COPY backend ./backend
COPY public ./public
COPY views ./views

# Run as the non-root "node" user the base image already ships with,
# instead of root.
USER node

WORKDIR /app/backend

# Informational only. Render injects its own PORT env var at runtime
# (server.js already reads process.env.PORT), so this doesn't need to
# match whatever Render assigns — it's just documentation for anyone
# reading the image, and for `podman run -P`.
EXPOSE 10000

# Invoke node directly rather than "npm start" so it receives SIGTERM
# straight from the container runtime and can shut down immediately,
# instead of waiting out npm's wrapper process.
CMD ["node", "server.js"]
