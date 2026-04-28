import { PageHeader } from '@/components/layout/PageHeader'
import { TicketList } from '@/components/tickets/TicketList'
import { useTicketsByStatus } from '@/lib/queries'

export function FollowUpPage() {
  const { data, loading, error } = useTicketsByStatus('follow_up')
  return (
    <>
      <PageHeader title="Follow-Up" description="Things to nudge soon." />
      <TicketList
        tickets={data}
        loading={loading}
        error={error}
        empty="No follow-ups queued."
      />
    </>
  )
}
