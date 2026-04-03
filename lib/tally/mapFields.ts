/**
 * Tally field mapping utility.
 *
 * Supports two Tally response shapes:
 *
 * Shape A — legacy fields array (webhooks):
 *   submission.fields: [{ key, label, type, value, options? }]
 *
 * Shape B — responses dict (submissions API):
 *   submission.responses: { [questionId]: { value } }
 *   questions: [{ id, title }]  ← supply questionMap built from this
 */

export interface TallyField {
  key?:     string
  label?:   string
  type?:    string
  value?:   unknown
  options?: { id: string; text: string }[]
}

export interface MappedSubmission {
  name:    string | null
  phone:   string | null
  ig:      string | null
  answers: Record<string, unknown>
}

function stringValue(value: unknown, options?: { id: string; text: string }[]): string | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'string')  return value.trim() || null
  if (typeof value === 'number')  return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (Array.isArray(value)) {
    if (value.length === 0) return null

    // Array of option-ID strings → resolve to labels via options[]
    if (options?.length && typeof value[0] === 'string') {
      const labels = (value as string[]).map(
        (id) => options.find((o) => o.id === id)?.text ?? id
      )
      return labels.join(', ')
    }

    // Array of objects with a `text` property (Tally checkbox / ranking style)
    if (typeof value[0] === 'object' && value[0] !== null && 'text' in (value[0] as object)) {
      return (value as { text: string }[]).map((o) => o.text).join(', ')
    }

    // Fallback: join primitive array values
    return (value as unknown[]).map(String).join(', ') || null
  }

  // Object — convert to JSON string as last resort
  return JSON.stringify(value)
}

/**
 * Map a submission whose answers live in submission.responses
 * (the shape returned by the Tally submissions API).
 *
 * @param responses  { [questionId]: { value: unknown } }
 * @param questionMap  Map<questionId, questionTitle> built from the top-level questions array
 */
export function mapTallyResponses(
  responses: Record<string, { value?: unknown }>,
  questionMap: Map<string, string>,
): MappedSubmission {
  let name:  string | null = null
  let phone: string | null = null
  let ig:    string | null = null
  const answers: Record<string, unknown> = {}

  for (const [questionId, response] of Object.entries(responses)) {
    const displayKey = questionMap.get(questionId) ?? questionId
    const val = stringValue(response?.value)
    const lower = displayKey.toLowerCase()

    answers[displayKey] = val

    if (name  === null && (lower.includes('imię') || lower.includes('name') || lower.includes('first name'))) {
      name = val
    }
    if (phone === null && (lower.includes('telefon') || lower.includes('phone') || lower.includes('numer'))) {
      phone = val
    }
    if (ig    === null && (lower.includes('instagram') || lower.includes(' ig ') || lower.includes('handle'))) {
      ig = val
    }
  }

  return { name, phone, ig, answers }
}

export function mapTallySubmission(fields: TallyField[]): MappedSubmission {
  let name:  string | null = null
  let phone: string | null = null
  let ig:    string | null = null

  const answers: Record<string, unknown> = {}

  for (const field of fields) {
    // Use label as the human-readable key; fall back to key if label absent.
    // Skip entirely if both are missing (guards against malformed entries).
    const displayKey = field.label ?? field.key
    if (!displayKey) continue

    const val   = stringValue(field.value, field.options)
    const lower = displayKey.toLowerCase()

    answers[displayKey] = val

    if (name  === null && (lower.includes('imię') || lower.includes('name') || lower.includes('first name'))) {
      name = val
    }
    if (phone === null && (lower.includes('telefon') || lower.includes('phone') || lower.includes('numer'))) {
      phone = val
    }
    if (ig    === null && (lower.includes('instagram') || lower.includes(' ig ') || lower.includes('handle'))) {
      ig = val
    }
  }

  return { name, phone, ig, answers }
}
