#!/bin/bash
# Canary (#70): Getting started on a fresh Linux, as a new user would, with the packages on npm.
# Standalone, Next.js and Nuxt, each with npm: install, run, create the first admin, publish a
# post and read it back. On the host it starts a clean container and runs itself inside:
#   canary/run.sh [image] [node]    image: ubuntu:26.04 (default)    node: apt | nodesource (24)
# Prints PASS or FAIL per step; exits non-zero if any failed.
set -uo pipefail

IMAGE="${1:-ubuntu:26.04}"
NODE="${2:-nodesource}"

if [ ! -f /.dockerenv ]; then
  echo "== $IMAGE, Node from $NODE"
  exec docker run --rm -e NODE_FROM="$NODE" -v "$(cd "$(dirname "$0")" && pwd)/run.sh:/canary.sh:ro" \
    "$IMAGE" bash /canary.sh "$IMAGE" "$NODE"
fi

export DEBIAN_FRONTEND=noninteractive CI=1 NEXT_TELEMETRY_DISABLED=1 NUXT_TELEMETRY_DISABLED=1
FAILED=0
pass() { echo "PASS  $*"; }
fail() { echo "FAIL  $*"; FAILED=1; }
step() { echo; echo "---- $*"; }

# Waits up to $2 seconds for a URL to answer with anything but 5xx (Nuxt answers 503 while it
# is still starting).
wait_for() {
  local code
  for _ in $(seq 1 "${2:-180}"); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$1")
    case "$code" in 000 | 5*) sleep 1 ;; *) return 0 ;; esac
  done
  return 1
}

# The first admin, a published post, then the post read back over REST.
check_cms() {
  local base="$1" name="$2"
  local code
  code=$(curl -sL -o /dev/null -w '%{http_code}' "$base/admin")
  [ "$code" = 200 ] && pass "$name: /admin answers 200" || fail "$name: /admin answered $code"
  curl -s "$base/api/cms/auth/init" | grep -q '"hasUsers":false' \
    && pass "$name: asks for the first admin" || fail "$name: auth/init didn't ask for the first admin"
  local jar csrf
  jar=$(mktemp)
  curl -s -c "$jar" -X POST "$base/api/cms/auth/first-register" -H 'content-type: application/json' \
    -H "origin: $base" -d '{"email":"admin@canary.test","password":"canary-pass-1234","name":"Admin"}' > /dev/null
  csrf=$(curl -s -b "$jar" "$base/api/cms/auth/me" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')
  [ -n "$csrf" ] && pass "$name: first admin signed in" || fail "$name: no session after first-register"
  curl -s -b "$jar" -X POST "$base/api/cms/posts" -H 'content-type: application/json' -H "origin: $base" \
    -H "x-csrf-token: $csrf" -d '{"title":"Hello from the canary","status":"published"}' > /dev/null
  curl -s "$base/api/cms/posts" | grep -q 'Hello from the canary' \
    && pass "$name: post published and read over REST" || fail "$name: the post isn't readable"
  rm -f "$jar"
}

step "System and Node"
. /etc/os-release && echo "$PRETTY_NAME"
# git: new Nuxt apps start a repository.
apt-get update -qq && apt-get install -y -qq curl ca-certificates git > /dev/null
if [ "$NODE" = apt ]; then
  apt-get install -y -qq nodejs npm > /dev/null
else
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null
fi
NODE_VERSION=$(node -v 2>/dev/null) || NODE_VERSION=none
echo "node $NODE_VERSION, npm $(npm -v 2>/dev/null || echo none)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)' \
  && pass "Node $NODE_VERSION is 22.12 or newer" || fail "Node $NODE_VERSION is older than 22.12"
NUXT_OK=1
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=19)?0:1)' \
  || NUXT_OK=0
mkdir -p /work && cd /work || exit 1

step "Standalone: npm create easy-cms@latest my-cms"
if npm create easy-cms@latest my-cms -- --yes > standalone.log 2>&1; then
  pass "standalone: created"
  (cd my-cms && npm run dev > ../standalone-dev.log 2>&1 &)
  if wait_for http://localhost:4000/api/cms/auth/init 120; then
    check_cms http://localhost:4000 standalone
  else
    fail "standalone: the server didn't start"; tail -20 standalone-dev.log
  fi
  pkill -f "easy-cms serve" || true
else
  fail "standalone: create failed"; tail -20 standalone.log
fi

step "Next.js: create-next-app, then npx create-easy-cms"
if npx --yes create-next-app@latest next-app --yes > next-create.log 2>&1; then
  cd next-app || exit 1
  if npx --yes create-easy-cms --yes > ../next-easy.log 2>&1; then
    pass "next: Easy CMS added"
    (PORT=3000 npm run dev > ../next-dev.log 2>&1 &)
    if wait_for http://localhost:3000/api/cms/auth/init 240; then
      check_cms http://localhost:3000 next
    else
      fail "next: the dev server didn't start"; tail -20 ../next-dev.log
    fi
    pkill -f "next dev" || true
  else
    fail "next: create-easy-cms failed"; tail -20 ../next-easy.log
  fi
  cd /work || exit 1
else
  fail "next: create-next-app failed"; tail -20 next-create.log
fi

step "Nuxt: npm create nuxt@latest, then npx create-easy-cms"
if [ "$NUXT_OK" = 0 ]; then
  fail "nuxt: Node $NODE_VERSION is older than 22.19, which Nuxt needs (skipped)"
elif npm create nuxt@latest nuxt-app -- --template minimal --packageManager npm --gitInit=false \
  --no-modules --force > nuxt-create.log 2>&1 < /dev/null; then
  cd nuxt-app || exit 1
  if npx --yes create-easy-cms --yes > ../nuxt-easy.log 2>&1; then
    pass "nuxt: Easy CMS added"
    (npm run dev -- --port 3001 > ../nuxt-dev.log 2>&1 &)
    if wait_for http://localhost:3001/api/cms/auth/init 240; then
      check_cms http://localhost:3001 nuxt
    else
      fail "nuxt: the dev server didn't start"; tail -20 ../nuxt-dev.log
    fi
    pkill -f "nuxi" || true
  else
    fail "nuxt: create-easy-cms failed"; tail -20 ../nuxt-easy.log
  fi
  cd /work || exit 1
else
  fail "nuxt: create nuxt failed"; tail -20 nuxt-create.log
fi

echo
[ "$FAILED" = 0 ] && echo "== canary passed ($IMAGE, node $NODE_VERSION)" \
  || echo "== canary FAILED ($IMAGE, node $NODE_VERSION)"
exit "$FAILED"
