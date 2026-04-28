import { PageHeader } from '@/components/layout/PageHeader'

export function NowPage() {
  return (
    <>
      <PageHeader
        title="Now"
        description="Tickets requiring action today."
      />
      <div className="px-8 py-6 text-sm text-muted-foreground">
        Nothing is on your plate right now.
      </div>
    </>
  )
}
