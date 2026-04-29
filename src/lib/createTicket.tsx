import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  TicketCreateDialog,
  type TicketCreatePrefill,
} from '@/components/tickets/TicketCreateDialog'
import { TicketCreateChat } from '@/components/tickets/TicketCreateChat'
import type { TicketStatus } from '@/types/orbit'

type CreateTicketContextValue = {
  openCreate: (defaultStatus?: TicketStatus) => void
}

const CreateTicketContext = createContext<CreateTicketContextValue | undefined>(
  undefined,
)

type Mode = 'closed' | 'chat' | 'manual'

export function CreateTicketProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('closed')
  const [defaultStatus, setDefaultStatus] = useState<TicketStatus | undefined>(
    undefined,
  )
  const [manualPrefill, setManualPrefill] = useState<
    TicketCreatePrefill | undefined
  >(undefined)

  const openCreate = useCallback((status?: TicketStatus) => {
    setDefaultStatus(status)
    setManualPrefill(undefined)
    setMode('chat')
  }, [])

  const switchToManual = useCallback((prefill?: TicketCreatePrefill) => {
    setManualPrefill(prefill)
    setMode('manual')
  }, [])

  const closeAll = useCallback(() => {
    setMode('closed')
    setManualPrefill(undefined)
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
      <TicketCreateChat
        open={mode === 'chat'}
        onOpenChange={(open) => {
          if (!open) closeAll()
        }}
        onSwitchToManual={switchToManual}
        defaultStatus={defaultStatus}
      />
      <TicketCreateDialog
        open={mode === 'manual'}
        onOpenChange={(open) => {
          if (!open) closeAll()
        }}
        defaultStatus={defaultStatus}
        prefill={manualPrefill}
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
