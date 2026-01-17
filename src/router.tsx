import { createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'
import { queryClient } from './integrations/convex/provider'

// Create a new router instance
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: { queryClient },

    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  })

  return router
}
