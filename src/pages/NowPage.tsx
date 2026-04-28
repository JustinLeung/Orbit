import { PageHeader } from '@/components/layout/PageHeader'
import { TicketList } from '@/components/tickets/TicketList'
import { useNowTickets } from '@/lib/queries'

export function NowPage() {
  const { data, loading, error } = useNowTickets()
  return (
    <>
      <PageHeader
        title="Now"
        description="Tickets requiring action today."
      />
      <TicketList
        tickets={data}
        loading={loading}
        error={error}
        empty="Nothing is on your plate right now."
      />
    </>
  )
}
