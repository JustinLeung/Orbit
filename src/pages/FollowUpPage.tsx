import { PageHeader } from '@/components/layout/PageHeader'

export function FollowUpPage() {
  return (
    <>
      <PageHeader title="Follow-Up" description="Things to nudge soon." />
      <div className="px-8 py-6 text-sm text-muted-foreground">
        No follow-ups queued.
      </div>
    </>
  )
}
