import { PageHeader } from '@/components/layout/PageHeader'
import { usePeople } from '@/lib/queries'

export function PeoplePage() {
  const { data, loading, error } = usePeople()
  return (
    <>
      <PageHeader
        title="People"
        description="Everyone tied to your open loops."
      />
      {loading ? (
        <div className="px-8 py-6 text-sm text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="px-8 py-6 text-sm text-destructive">
          {error.message}
        </div>
      ) : data.length === 0 ? (
        <div className="px-8 py-6 text-sm text-muted-foreground">
          No people yet.
        </div>
      ) : (
        <ul className="divide-y">
          {data.map((p) => (
            <li
              key={p.id}
              className="flex items-start gap-4 px-8 py-4 hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium">{p.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[p.organization, p.email].filter(Boolean).join(' · ')}
                </p>
                {p.relationship_tags.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.relationship_tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded border bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
