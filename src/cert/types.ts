export type CertGrader = 'PSA' | 'CGC'

export interface CertQuery {
  grader: CertGrader
  certNumber: string
}

export interface CertRecord {
  cardName: string
  setName: string | null
  /** Normalized "<GRADER> <grade>", e.g. "PSA 10", "CGC 9.5". */
  gradeLabel: string
  year: string | null
  /** Source payload for debugging/display. */
  raw: unknown
}

export interface CertLookupResult {
  found: boolean
  record: CertRecord | null
  source: 'psa-api' | 'cgc-page'
  errors: string[]
}
