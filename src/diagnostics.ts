import type { MatchKind, Provider } from './types'

export type SearchStage = 'upload' | MatchKind | 'filter' | 'routing'

// Only structured diagnostics belong in logs, never response bodies or request URLs.
export interface SearchDiagnostic {
  stage: SearchStage
  provider?: Provider
  keyIndex?: number
  attempt?: number
  cooldownSeconds?: number
  httpStatus?: number
  searchId?: string
  status?: 'Success' | 'Error' | 'Processing' | 'Unknown'
  outcome?: 'results' | 'empty' | 'error' | 'attempt' | 'retry' | 'skipped'
  error?: string
  count?: number
  rawCount?: number
  platformCount?: number
  selectedCount?: number
  cookiesUpdated?: number
}

export type DiagnosticReporter = (event: SearchDiagnostic) => void
