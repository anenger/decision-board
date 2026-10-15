import { createRouter } from '@tanstack/react-router'
import { QueryClient, notifyManager } from '@tanstack/react-query'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'
import { NotFound } from './components/NotFound'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'

export const getRouter = () => {
  if (typeof document !== 'undefined') {
    notifyManager.setScheduler(window.requestAnimationFrame)
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
      },
    },
  })

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}
