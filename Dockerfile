# Carousel-Crafter
#
# The image carries its own Chromium. Rendering is the whole job here, and a container that
# depends on a browser from the host defeats the point of containerising it — it would also
# lose the reproducibility the render pipeline is built around, since a pinned Chromium is
# what makes text metrics identical everywhere.
#
# Playwright's own base image already has the browser and every system font and library it
# needs, which is a long and easy-to-get-wrong list to assemble by hand.

# --- build ------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS build

WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.web.json vite.config.ts ./
COPY src ./src
COPY web ./web

RUN npm run build

# Drop dev dependencies from the tree that gets copied forward.
RUN npm prune --omit=dev

# --- runtime ----------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS runtime

WORKDIR /app

ENV NODE_ENV=production
# The image ships Chromium, so the CLI must not look for the host's Google Chrome. See
# src/capture/browser.ts — the channel is skipped when this is set.
ENV CAROUSEL_CRAFTER_BROWSER=bundled

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY package.json ./

# Posts are mounted here. Everything the tool reads and writes lives in this one directory:
# the markdown, the images it references, settings, and the exported PNGs.
VOLUME ["/posts"]
WORKDIR /posts

EXPOSE 5178

# Bound to 0.0.0.0 rather than loopback, because loopback inside a container is unreachable
# from the host. The server has no authentication, so publish the port to 127.0.0.1 only —
# the compose file and the README both do.
ENV CAROUSEL_CRAFTER_HOST=0.0.0.0

ENTRYPOINT ["node", "/app/dist/cli.js"]
CMD ["web", "/posts", "--port", "5178", "--no-open"]
