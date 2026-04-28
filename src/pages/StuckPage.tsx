import { PageHeader } from '@/components/layout/PageHeader'

export function StuckPage() {
  return (
    <>
      <PageHeader
        title="Stuck"
        description="Tickets without a clear next action."
      />
      <div className="px-8 py-6 text-sm text-muted-foreground">
        Nothing is stuck.
      </div>
    </>
  )
}
