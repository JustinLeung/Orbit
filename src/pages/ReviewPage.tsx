import { PageHeader } from '@/components/layout/PageHeader'
import { TicketList } from '@/components/tickets/TicketList'
import { useTicketsByStatus } from '@/lib/queries'

export function ReviewPage() {
  const { data, loading, error } = useTicketsByStatus('review')
  return (
    <>
      <PageHeader
        title="Review"
        description="Agent output waiting for your judgment."
      />
      <TicketList
        tickets={data}
        loading={loading}
        error={error}
        empty="No agent runs to review."
      />
    </>
  )
}
