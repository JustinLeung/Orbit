import { PageHeader } from '@/components/layout/PageHeader'

export function WaitingPage() {
  return (
    <>
      <PageHeader title="Waiting" description="Open loops on someone else." />
      <div className="px-8 py-6 text-sm text-muted-foreground">
        Nothing waiting.
      </div>
    </>
  )
}
