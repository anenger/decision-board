import { createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { ConvexQueryClient } from '@convex-dev/react-query'
import { QueryClient, notifyManager } from '@tanstack/react-query'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import React from 'react'
import { env } from './env'
import { routeTree } from './routeTree.gen'
import { NotFound } from './components/NotFound'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'

// Create a new router instance
export const getRouter = () => {
  if (typeof document !== 'undefined') {
    notifyManager.setScheduler(window.requestAnimationFrame)
  }
  const CONVEX_URL = env.VITE_CONVEX_URL
  if (!CONVEX_URL) {
    console.error('missing envar VITE_CONVEX_URL')
  }

  const convex = new ConvexReactClient(CONVEX_URL)
  const convexQueryClient = new ConvexQueryClient(convex)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  })
  convexQueryClient.connect(queryClient)

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    Wrap: ({ children }: { children: React.ReactNode }) => (
      <ConvexProvider client={convexQueryClient.convexClient}>
        {children}
      </ConvexProvider>
    ),
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}
