# Jobs

::: info What you'll learn
Run your own background work on a schedule (`jobs`), at a time of day in your time zone, and see,
pause or reschedule it from **Settings → Jobs**.

**Before this page:** [Scheduled publishing](./drafts#scheduled-publishing).
:::

A job is a function Easy CMS runs with its scheduled jobs: every minute on a long-running server
(Nuxt, `easy-cms serve`, a self-hosted Next.js), or each time a cron calls `<api>/jobs/run` on
serverless hosts (see [who runs the jobs](./drafts#scheduled-publishing)). Plugins add their own;
the shop, for example, checks payments every 5 minutes.

```ts
// easy-cms.config.ts
export default defineConfig({
  // Times of day below are in this zone. Default: the server's (often UTC on serverless).
  timeZone: 'Asia/Bangkok',
  jobs: [
    // Every 10 minutes.
    { name: 'feed:import', every: 600, run: ({ cms }) => importFeed(cms) },
    // Every day at 02:00, Bangkok time. Admins may change when it runs.
    { name: 'sitemap:refresh', at: '02:00', adminSchedule: true, run: refreshSitemap },
    // Weekly: every 7 days at 03:00, counted from the last run.
    { name: 'report:weekly', every: 604_800, at: '03:00', run: sendReport },
  ],
})
```

| Option | | |
|---|---|---|
| `name` | **required** | Unique, lowercase, e.g. `shop:clean-up`. |
| `run` | **required** | `({ cms, now }) => …`. A thrown error is logged and shown on Settings → Jobs. |
| `every` | every run | At most this often, in seconds. With `at`, a number of whole days (default one). |
| `at` | — | A time of day, `HH:MM` in `timeZone`. |
| `adminSchedule` | `false` | Admins may change `every` and `at` from Settings → Jobs. |

**Missed runs.** A job whose time passed while nothing ran (the server was down, a cron was late)
runs once as soon as jobs run again, then goes back to its schedule.

**Several instances.** Each run is claimed in the database before it starts, so a job runs once at
its time however many servers (or the scheduler and the cron at once) run jobs. Write jobs so a
second run would do no harm anyway: a run that stops half-way (a crash, a deploy) is not retried
until its next time.

**The time zone** also applies to [`backups.at`](./backups).

## Settings → Jobs

Admins, and [roles](./roles) given **Jobs**, see every job with its schedule, when it last ran and
how long it took, its result (with the error when it failed) and when it runs next. A second tab
lists [scheduled publishing](./drafts#scheduled-publishing) that is waiting, running or failed.
**Run due jobs now** runs whatever is due, as the cron would.

The page also says when jobs last ran, and warns when nothing has run them for 10 minutes (on
serverless hosts, usually a missing cron). **Built in** lists what Easy CMS does with every run:
scheduled publishing, webhook and email retries, scheduled backups and the audit log check, each
with a link to its page.

Admins of the whole site can also:

- **Pause** a job, for example while the service it calls is down. It doesn't run until someone
  **resumes** it, and the dashboard shows it under **Needs attention** so it isn't forgotten.
- **Change the schedule** of a job with `adminSchedule`: how often, and at what time of day. The
  card says it was set by an admin and shows the config's schedule beside it; **Use the config's
  schedule** goes back. Jobs without `adminSchedule` keep the schedule their code gives, since it
  may matter (the shop's payment check must run often).

Pausing, resuming and schedule changes are kept in the [audit log](./audit-log). A job whose last
run failed also shows on the dashboard; see [health checks](./health-checks#failed-jobs).

## Next steps

- [Scheduled publishing](./drafts#scheduled-publishing): publish and unpublish at a set time.
- [Health checks](./health-checks): what the dashboard warns admins about.
- [Plugins](./plugins): add jobs from a plugin.
