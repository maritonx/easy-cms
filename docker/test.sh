#!/bin/sh
# Builds an app on the image the way the Docker guide does, starts it and waits for it to be
# healthy: `docker/test.sh <image>`. CI runs it on every change and before publishing.
set -eu
image=$1
dir=$(mktemp -d)
name=easy-cms-image-test-$$
cleanup() {
  docker rm -f "$name" > /dev/null 2>&1 || true
  docker image rm "$name" > /dev/null 2>&1 || true
  # The migration was written by the image's user, another uid than this one on Linux.
  docker run --rm --user root -v "$dir:/work" --entrypoint rm "$image" -rf /work/easy-cms > /dev/null 2>&1 || true
  rm -rf "$dir"
}
trap cleanup EXIT

mkdir "$dir/easy-cms"
chmod 777 "$dir/easy-cms"
cat > "$dir/easy-cms.config.ts" << 'CONFIG'
import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  secret: process.env.EASY_CMS_SECRET as string,
  db: sqlite({ url: 'file:./data/cms.db' }),
  upload: { dir: './data/uploads' },
  collections: [{ slug: 'posts', access: { read: () => true }, fields: [{ name: 'title', type: 'text' }] }],
})
CONFIG
printf 'FROM %s\nCOPY easy-cms.config.ts ./\nCOPY easy-cms ./easy-cms\n' "$image" > "$dir/Dockerfile"
secret=$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')

# The migration, made with the image's own CLI, as in development.
docker run --rm -e NODE_ENV=development -e EASY_CMS_SECRET="$secret" \
  -v "$dir/easy-cms.config.ts:/app/easy-cms.config.ts:ro" -v "$dir/easy-cms:/app/easy-cms" \
  --entrypoint easy-cms "$image" migrate:create init
docker build -t "$name" "$dir"
docker run -d --name "$name" -p 127.0.0.1::4000 -e EASY_CMS_SECRET="$secret" "$name" > /dev/null

for _ in $(seq 1 40); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$name")
  [ "$status" = healthy ] && break
  [ "$status" = unhealthy ] && break
  sleep 3
done
port=$(docker port "$name" 4000/tcp | head -n 1 | sed 's/.*://')
fail() { echo "image test failed: $1"; docker logs "$name"; exit 1; }
[ "$status" = healthy ] || fail "health is $status"
[ "$(docker exec "$name" id -un)" = node ] || fail 'not running as node'
for path in /healthz /api/cms/posts /admin/; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port$path")
  [ "$code" = 200 ] || fail "$path answered $code"
done
echo "image test passed: $image"
