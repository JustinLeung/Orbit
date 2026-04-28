import { PageHeader } from '@/components/layout/PageHeader'
import { TicketList } from '@/components/tickets/TicketList'
import { useStuckTickets } from '@/lib/queries'

export function StuckPage() {
  const { data, loading, error } = useStuckTickets()
  return (
    <>
      <PageHeader
        title="Stuck"
        description="Tickets without a clear next action."
      />
      <TicketList
        tickets={data}
        loading={loading}
        error={error}
        empty="Nothing is stuck."
      />
    </>
  )
}
