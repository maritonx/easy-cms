#!/bin/sh
# Applies pending migrations, then serves. With several instances, migrate once elsewhere (an
# init container, a release step) and start these with EASY_CMS_MIGRATE=false.
set -e
if [ "${EASY_CMS_MIGRATE:-true}" != "false" ]; then
  easy-cms migrate
fi
exec easy-cms serve --trust-proxy "$@"
