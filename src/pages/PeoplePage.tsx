import { PageHeader } from '@/components/layout/PageHeader'

export function PeoplePage() {
  return (
    <>
      <PageHeader
        title="People"
        description="Everyone tied to your open loops."
      />
      <div className="px-8 py-6 text-sm text-muted-foreground">
        No people yet.
      </div>
    </>
  )
}
