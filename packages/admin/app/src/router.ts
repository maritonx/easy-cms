import { createRouter, createWebHistory } from 'vue-router'
import { setUnauthorizedHandler } from './lib/api'
import { loadSession, session } from './lib/session'
import { settings } from './lib/settings'

const PUBLIC = new Set(['login', 'setup'])

export const router = createRouter({
  history: createWebHistory(settings.adminPath),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    { path: '/setup', name: 'setup', component: () => import('./views/SetupView.vue') },
    {
      path: '/',
      component: () => import('./components/AppLayout.vue'),
      children: [
        { path: '', name: 'dashboard', component: () => import('./views/DashboardView.vue') },
        {
          path: 'collections/:slug',
          name: 'list',
          component: () => import('./views/ListView.vue'),
        },
        {
          path: 'collections/:slug/new',
          name: 'create',
          component: () => import('./views/EditView.vue'),
        },
        {
          path: 'collections/:slug/:id',
          name: 'edit',
          component: () => import('./views/EditView.vue'),
        },
        {
          path: 'globals/:slug',
          name: 'global',
          component: () => import('./views/GlobalView.vue'),
        },
        { path: 'account', name: 'account', component: () => import('./views/AccountView.vue') },
        {
          path: ':rest(.*)*',
          name: 'not-found',
          component: () => import('./views/NotFoundView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  if (!session.loaded) await loadSession()
  const name = String(to.name ?? '')
  if (!session.user) {
    if (!session.hasUsers) return name === 'setup' ? true : { name: 'setup' }
    if (name === 'login') return true
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  }
  if (PUBLIC.has(name)) return { name: 'dashboard' }
  return true
})

// A 401 from the API means the session expired: go back to the login page.
setUnauthorizedHandler(() => {
  session.user = null
  session.schema = null
  if (router.currentRoute.value.name !== 'login') {
    void router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
  }
})

// A new version was deployed while this tab was open: the page files it knows of are gone.
// Load the page the user was going to from the server once, instead of failing silently.
const RELOADED = 'easy-cms-reloaded-for'
const staleChunk = (error: unknown) =>
  // Browsers word a missing module differently; Vite says so when a page's CSS is missing.
  /dynamically imported module|importing a module script failed|error loading dynamically|unable to preload css/i.test(
    String((error as Error)?.message ?? error),
  )
router.onError((error, to) => {
  if (!staleChunk(error)) return
  const target = router.resolve(to).href
  try {
    // Once per address: if the files are still missing after a reload, show the error.
    if (sessionStorage.getItem(RELOADED) === target) return
    sessionStorage.setItem(RELOADED, target)
  } catch {
    // no storage: reload anyway
  }
  window.location.assign(target)
})
router.afterEach(() => {
  try {
    sessionStorage.removeItem(RELOADED)
  } catch {
    // ignore
  }
})
