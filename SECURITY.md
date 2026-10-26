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
| Latest 1.x minor | ✅ |
| Older 1.x minors | ❌ upgrade to the latest minor (no breaking changes within 1.x) |
| 0.x | ❌ upgrade to 1.x |

Fixes go to the latest minor release. Once 2.0 is out, the latest 1.x minor keeps getting them
for six months. See
[versions and deprecations](https://easy-cms-website.vercel.app/docs/versioning).

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

## What is checked

Easy CMS has had no external security audit or penetration test. What there is:

- **A self-review** against [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
  level 1 (below). Level 2 is planned.
- **Tests in CI** for authentication, access control, CSRF and origin checks, login rate limits,
  uploads, and several instances sharing one database (sessions, limits and jobs across servers).
- **Code scanning** with CodeQL on every pull request and weekly.
- **Dependencies**: Dependabot alerts and security updates, and weekly version updates.
- **Secrets**: GitHub secret scanning with push protection. npm packages are published from CI
  with trusted publishing and provenance, so no npm token is stored.

## Past reviews

- [OWASP ASVS level 1 review](docs/security/asvs-l1.md) (October 2026): what was found and the
  release that fixed each.
