import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * False during server rendering and hydration, true after. Use it for
 * anything that depends on the viewer's clock or time zone, like "Oct 15" or
 * "5 minutes ago", which the server (in UTC) would render differently.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
