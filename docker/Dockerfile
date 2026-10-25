# The official image: `easy-cms serve` with the common adapters, built from the packages on npm.
# Add your config in a Dockerfile of your own:
#
#   FROM ghcr.io/maritonx/easy-cms:1
#   COPY easy-cms.config.ts ./
#   COPY easy-cms ./easy-cms
#
# Built by release.yml after each release (VERSION = the version just published).
FROM node:24-slim

ARG VERSION
WORKDIR /app

# A project of its own, so a config in /app finds these, and `npm install` in an image built
# on this one adds to them (plugins, your own packages).
RUN test -n "$VERSION" \
  && npm init -y > /dev/null \
  && npm pkg set name=easy-cms-app private=true type=module \
  && npm install --omit=dev --no-fund --no-audit \
    "easy-cms@$VERSION" \
    "@easy-cms/core@$VERSION" \
    "@easy-cms/db-sqlite@$VERSION" \
    "@easy-cms/db-postgres@$VERSION" \
    "@easy-cms/storage-s3@$VERSION" \
    "@easy-cms/email-smtp@$VERSION" \
    sharp \
  && npm cache clean --force \
  && mkdir data \
  && chown -R node:node /app

COPY --chown=node:node --chmod=755 entrypoint.sh /usr/local/bin/easy-cms-entrypoint
COPY --chown=node:node --chmod=755 healthcheck.mjs /usr/local/bin/easy-cms-healthcheck

USER node
ENV NODE_ENV=production PORT=4000 PATH=/app/node_modules/.bin:$PATH
EXPOSE 4000
# SQLite files and uploads on local disk, when the config keeps them under ./data.
VOLUME /app/data

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "/usr/local/bin/easy-cms-healthcheck"]
ENTRYPOINT ["easy-cms-entrypoint"]
