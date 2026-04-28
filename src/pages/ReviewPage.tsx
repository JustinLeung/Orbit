import { PageHeader } from '@/components/layout/PageHeader'

export function ReviewPage() {
  return (
    <>
      <PageHeader
        title="Review"
        description="Agent output waiting for your judgment."
      />
      <div className="px-8 py-6 text-sm text-muted-foreground">
        No agent runs to review.
      </div>
    </>
  )
}
