# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository ("Security" → "Report a vulnerability"). Include:

- the affected package(s) and version(s)
- how to reproduce it: a config and the requests, or a failing test
- the impact you see (what an attacker can read, change or break)

## What happens next

| When | What |
|---|---|
| Within 7 days | We confirm we received it and whether we can reproduce it |
| Within 30 days | A fix is released, sooner for issues that are easy to exploit; if it takes longer we tell you why and when |
| With the fix | A GitHub security advisory (with a CVE when it qualifies), crediting you unless you prefer otherwise |

Please keep the details private until the advisory is published. Fixes are released as patch
versions of every `@easy-cms/*` package, which share one version number.

## Supported versions

| Version | Security fixes |
|---|---|
| Latest minor (0.48.x) | ✅ |
| Older 0.x | ❌ upgrade to the latest minor |

Easy CMS is pre-1.0: only the latest minor release gets fixes. From 1.0, the latest major and,
for six months after a new major, the previous one get fixes. See
[versions and support](https://easy-cms-website.vercel.app/docs/backups#versioning).

## Scope

In scope: the published packages (`@easy-cms/*`, `easy-cms`, `create-easy-cms`), including the
admin UI, the REST API, authentication, access control and file uploads.

Out of scope:

- access rules or hooks in your own config that allow more than you meant (report it if a
  documented rule doesn't do what the docs say)
- the example apps in `examples/`, which are demos
- vulnerabilities in dependencies with no path to exploit them through Easy CMS (still welcome
  as a regular issue)
- denial of service through very large volumes of requests; put a rate limiter or CDN in front

## Hardening

The [security guide](https://easy-cms-website.vercel.app/docs/security) lists what Easy CMS does
(password hashing, login rate limiting, CSRF and origin checks, upload sandboxing) and what to set
up in production.

## Past reviews

- [OWASP ASVS level 1 review](docs/security/asvs-l1.md) (October 2026): what was found and the
  release that fixed each.
