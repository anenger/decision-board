import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

import appCss from '../styles.css?url'
import type { QueryClient } from '@tanstack/react-query'
import { NotFound } from '@/components/NotFound'
import { DefaultCatchBoundary } from '@/components/DefaultCatchBoundary'
import { Doodles } from '@/components/Doodles'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        // viewport-fit=cover lets the layout use the iPhone safe-area insets.
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { name: 'theme-color', content: '#fff7ec' },
      {
        title: 'Decision Board',
      },
      {
        name: 'description',
        content: 'Make a board, share the link, and decide things together.',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootComponent,
  errorComponent: (props) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    )
  },
  notFoundComponent: () => <NotFound />,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Doodles />
        {children}
        <Scripts />
      </body>
    </html>
  )
}
