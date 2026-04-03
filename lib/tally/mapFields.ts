/**
 * Tally field mapping utility.
 *
 * Scans a Tally submission's fields array and auto-detects common contact
 * fields by matching question labels (case-insensitive). All raw fields are
 * preserved in the `answers` JSONB blob regardless of whether they mapped.
 */

export interface TallyField {
  key: string
  label: string
  type: string
  value: unknown
  options?: { id: string; text: string }[]
}

export interface MappedSubmission {
  name: string | null
  phone: string | null
  ig: string | null
  /** All raw fields stored as { label: value } pairs for JSONB storage */
  answers: Record<string, unknown>
}

function stringValue(field: TallyField): string | null {
  if (field.value === null || field.value === undefined) return null
  if (typeof field.value === 'string') return field.value.trim() || null
  if (typeof field.value === 'number') return String(field.value)
  // Multiple choice — resolve option labels
  if (Array.isArray(field.value) && field.options?.length) {
    const selected = (field.value as string[])
      .map((id) => field.options?.find((o) => o.id === id)?.text ?? id)
      .filter(Boolean)
    return selected.join(', ') || null
  }
  return String(field.value)
}

export function mapTallySubmission(fields: TallyField[]): MappedSubmission {
  let name:  string | null = null
  let phone: string | null = null
  let ig:    string | null = null

  const answers: Record<string, unknown> = {}

  for (const field of fields) {
    const label = (field.label ?? '').toLowerCase()
    const val   = stringValue(field)

    // Store every field in answers using its label as the key
    answers[field.label ?? field.key] = val

    // Auto-detect: name
    if (
      name === null &&
      (label.includes('imię') || label.includes('name') || label.includes('first name'))
    ) {
      name = val
    }

    // Auto-detect: phone
    if (
      phone === null &&
      (label.includes('telefon') || label.includes('phone') || label.includes('numer'))
    ) {
      phone = val
    }

    // Auto-detect: Instagram handle
    if (
      ig === null &&
      (label.includes('instagram') || label.includes(' ig ') || label.includes('handle'))
    ) {
      ig = val
    }
  }

  return { name, phone, ig, answers }
}
