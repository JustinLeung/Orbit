import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { TicketCreateInline } from '@/components/tickets/TicketCreateInline'
import { TicketDetailDialog } from '@/components/tickets/TicketDetailDialog'
import { CreateTicketContext } from '@/lib/useCreateTicket'
import type { Ticket, TicketStatus } from '@/types/orbit'

// Capture flow: title-only modal → on submit, ticket gets created and the
// detail dialog opens for it (where the assist panel takes over). The
// previous "manual full form" path has been retired in favor of editing
// fields inline inside the detail dialog.
export function CreateTicketProvider({ children }: { children: ReactNode }) {
  const [captureOpen, setCaptureOpen] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<TicketStatus | undefined>(
    undefined,
  )
  const [openedTicket, setOpenedTicket] = useState<Ticket | null>(null)

  const openCreate = useCallback((status?: TicketStatus) => {
    setDefaultStatus(status)
    setCaptureOpen(true)
  }, [])

  const handleCreated = useCallback((ticket: Ticket) => {
    setCaptureOpen(false)
    setOpenedTicket(ticket)
  }, [])

  // Global "n" shortcut to start ticket capture — ignored while typing.
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      )
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      openCreate()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openCreate])

  const value = useMemo(() => ({ openCreate }), [openCreate])

  return (
    <CreateTicketContext.Provider value={value}>
      {children}
      <TicketCreateInline
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        onCreated={handleCreated}
        defaultStatus={defaultStatus}
      />
      <TicketDetailDialog
        ticket={openedTicket}
        open={openedTicket !== null}
        onOpenChange={(open) => {
          if (!open) setOpenedTicket(null)
        }}
      />
    </CreateTicketContext.Provider>
  )
}
