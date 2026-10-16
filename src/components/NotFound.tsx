import { Link } from '@tanstack/react-router'
import { Mascot } from './Mascot'

export function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Mascot mood="surprised" size={110} className="anim-float" />
      <h1 className="mt-6 text-3xl font-semibold sm:text-4xl">
        This page wandered off
      </h1>
      <p className="mt-2 max-w-sm text-ink-soft">
        The board might have been deleted, or the link has a typo.
      </p>
      <Link
        to="/"
        className="btn-chunky focus-ring mt-7 bg-tomato px-6 text-white"
      >
        Take me home
      </Link>
    </div>
  )
}
