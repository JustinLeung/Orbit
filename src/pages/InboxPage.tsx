import { PageHeader } from '@/components/layout/PageHeader'
import { TicketList } from '@/components/tickets/TicketList'
import { QuickAddInput } from '@/components/tickets/QuickAddInput'
import { useTicketsByStatus } from '@/lib/queries'

export function InboxPage() {
  const { data, loading, error } = useTicketsByStatus('inbox')
  return (
    <>
      <PageHeader
        title="Inbox"
        description="Captured but not yet clarified."
      />
      <QuickAddInput />
      <TicketList
        tickets={data}
        loading={loading}
        error={error}
        empty="No tickets in your inbox."
      />
    </>
  )
}
