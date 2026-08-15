import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { toMessage } from '../../lib/errors'
import type { Profile } from '../../lib/types'
import { fetchProfiles } from './queries'

export function MembersPage() {
  const { show } = useToast()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchProfiles()
      .then(setProfiles)
      .catch((e: unknown) => {
        const message = toMessage(e)
        setError(message)
        show(message)
      })
      .finally(() => setLoading(false))
  }, [show])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-semibold">メンバー</h1>
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="flex flex-col gap-3 py-8">
          <p role="alert" className="text-center text-sm text-muted">
            {error}
          </p>
          <Button variant="ghost" onClick={load}>
            再試行
          </Button>
        </div>
      ) : profiles.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">メンバーがいません</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <Link
                to={`/members/${profile.id}`}
                state={{ displayName: profile.display_name }}
                className="flex min-h-14 items-center rounded-xl border border-border bg-surface px-4 active:bg-border"
              >
                {profile.display_name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
