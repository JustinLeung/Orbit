import { createContext, useContext } from 'react'
import type { TicketStatus } from '@/types/orbit'

export type CreateTicketContextValue = {
  openCreate: (defaultStatus?: TicketStatus) => void
}

export const CreateTicketContext = createContext<
  CreateTicketContextValue | undefined
>(undefined)

export function useCreateTicket() {
  const ctx = useContext(CreateTicketContext)
  if (!ctx)
    throw new Error('useCreateTicket must be used within CreateTicketProvider')
  return ctx
}
