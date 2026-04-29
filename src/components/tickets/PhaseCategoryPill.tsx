import { cn } from '@/lib/utils'
import type { PhaseCategory } from '@/lib/assistTypes'

const CATEGORY_LABEL: Record<PhaseCategory, string> = {
  planning: 'Planning',
  research: 'Research',
  doing: 'Doing',
  waiting: 'Waiting',
  deciding: 'Deciding',
  closing: 'Closing',
}

// Color mapping uses static class strings so Tailwind's JIT picks them up.
const CATEGORY_CLASS: Record<PhaseCategory, string> = {
  planning:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300',
  research:
    'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/50 dark:bg-purple-950/40 dark:text-purple-300',
  doing:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
  waiting:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300',
  deciding:
    'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300',
  closing:
    'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
}

export function PhaseCategoryPill({
  category,
  className,
}: {
  category: PhaseCategory
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        CATEGORY_CLASS[category],
        className,
      )}
    >
      {CATEGORY_LABEL[category]}
    </span>
  )
}

export { CATEGORY_LABEL }
