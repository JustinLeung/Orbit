import { DefaultSurface } from './DefaultSurface'
import { PlanningSurface } from './PlanningSurface'
import type { PhaseSurfaceRegistry, SurfaceComponent } from './types'

// Per-PhaseCategory dispatcher for the assist panel BODY. Mirrors the
// PHASE_AGENTS registry one level up: where agents own the refine
// sub-form, surfaces own the entire panel body. Categories without a
// bespoke surface fall back to DEFAULT_SURFACE (which itself
// dispatches to the per-category agent for its refine slot).
//
// Currently bespoke: planning. Other categories use the default
// surface — they get the same body the panel had before per-phase
// surfaces existed. Bespoke surfaces for research/doing/deciding/
// waiting/closing can graduate later.
export const PHASE_SURFACES: PhaseSurfaceRegistry = {
  planning: PlanningSurface,
}

export const DEFAULT_SURFACE: SurfaceComponent = DefaultSurface

export function resolveSurface(
  category: import('@/lib/assistTypes').PhaseCategory,
): SurfaceComponent {
  return PHASE_SURFACES[category] ?? DEFAULT_SURFACE
}

export type {
  SurfaceComponent,
  SurfaceProps,
  PhaseSurfaceRegistry,
} from './types'
