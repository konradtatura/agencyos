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

export interface TallyResponseEntry {
  id?:           string
  questionId:    string
  submissionId?: string
  answer:        unknown
}

function resolveAnswer(answer: unknown): string | null {
  if (answer === null || answer === undefined) return null

  if (typeof answer === 'string')  return answer.trim() || null
  if (typeof answer === 'number')  return String(answer)
  if (typeof answer === 'boolean') return answer ? 'Yes' : 'No'

  if (Array.isArray(answer)) {
    if (answer.length === 0) return null
    return answer.map((item) => {
      if (typeof item === 'string') return item
      if (typeof item === 'object' && item !== null) {
        const o = item as Record<string, unknown>
        return o.text ?? o.label ?? o.value ?? JSON.stringify(o)
      }
      return String(item)
    }).join(', ') || null
  }

  if (typeof answer === 'object') {
    const o = answer as Record<string, unknown>
    // File upload / URL shape
    if (typeof o.url === 'string') return o.url
    if (typeof o.URL === 'string') return o.URL
    // Single-key objects
    const vals = Object.values(o)
    if (vals.length === 1) return String(vals[0])
    return JSON.stringify(o)
  }

  return String(answer)
}

/**
 * Map a submission whose answers live in submission.responses.
 *
 * Actual Tally API shape (confirmed from logs):
 *   responses: { "0": { id, questionId, submissionId, answer }, "1": ... }
 *
 * Keyed by numeric index string. Each entry carries questionId (not the key).
 *
 * @param responses  The raw responses object from the submission
 * @param questionMap  Map<questionId, questionTitle> built from top-level questions array
 */
export function mapTallyResponses(
  responses: Record<string, TallyResponseEntry>,
  questionMap: Map<string, string>,
): MappedSubmission {
  let name:  string | null = null
  let phone: string | null = null
  let ig:    string | null = null
  const answers: Record<string, unknown> = {}

  for (const entry of Object.values(responses)) {
    if (!entry?.questionId) continue
    const displayKey = questionMap.get(entry.questionId) ?? entry.questionId
    const val = resolveAnswer(entry.answer)
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
