import { PageHeader } from '@/components/layout/PageHeader'

export function InboxPage() {
  return (
    <>
      <PageHeader
        title="Inbox"
        description="Captured but not yet clarified."
      />
      <div className="px-8 py-6 text-sm text-muted-foreground">
        No tickets yet.
      </div>
    </>
  )
}
