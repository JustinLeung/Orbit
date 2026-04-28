import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { TicketCreateDialog } from '@/components/tickets/TicketCreateDialog'
import type { TicketStatus } from '@/types/orbit'

type CreateTicketContextValue = {
  openCreate: (defaultStatus?: TicketStatus) => void
}

const CreateTicketContext = createContext<CreateTicketContextValue | undefined>(
  undefined,
)

export function CreateTicketProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<TicketStatus | undefined>(
    undefined,
  )

  const openCreate = useCallback((status?: TicketStatus) => {
    setDefaultStatus(status)
    setOpen(true)
  }, [])

  // Global "n" shortcut to open the full editor — ignored while typing.
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
      <TicketCreateDialog
        open={open}
        onOpenChange={setOpen}
        defaultStatus={defaultStatus}
      />
    </CreateTicketContext.Provider>
  )
}

export function useCreateTicket() {
  const ctx = useContext(CreateTicketContext)
  if (!ctx)
    throw new Error('useCreateTicket must be used within CreateTicketProvider')
  return ctx
}
