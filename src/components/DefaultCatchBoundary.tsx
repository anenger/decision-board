import { Link, useRouter } from '@tanstack/react-router'
import { Mascot } from './Mascot'
import type { ErrorComponentProps } from '@tanstack/react-router'

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  console.error(error)

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Mascot
        mood="surprised"
        size={110}
        color="#ffd0e2"
        className="anim-float"
      />
      <h1 className="mt-6 text-3xl font-semibold sm:text-4xl">
        Something went wobbly
      </h1>
      <p className="mt-2 max-w-sm text-ink-soft">
        {error instanceof Error && error.message
          ? error.message
          : 'An unexpected error happened.'}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => router.invalidate()}
          className="btn-chunky focus-ring bg-tomato px-6 text-white"
        >
          Try again
        </button>
        <Link to="/" className="btn-chunky focus-ring bg-white px-6">
          Home
        </Link>
      </div>
    </div>
  )
}
