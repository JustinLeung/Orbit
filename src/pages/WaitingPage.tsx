import { PageHeader } from '@/components/layout/PageHeader'
import { TicketList } from '@/components/tickets/TicketList'
import { useTicketsByStatus } from '@/lib/queries'

export function WaitingPage() {
  const { data, loading, error } = useTicketsByStatus('waiting')
  return (
    <>
      <PageHeader title="Waiting" description="Open loops on someone else." />
      <TicketList
        tickets={data}
        loading={loading}
        error={error}
        empty="Nothing waiting."
      />
    </>
  )
}
