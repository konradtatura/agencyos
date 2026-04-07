/**
 * AES-256-GCM encrypt / decrypt for storing API keys at rest.
 * Requires ENCRYPTION_KEY env var: 64 hex characters (32 bytes).
 * Generate one with: openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length < 64) {
    throw new Error(
      'ENCRYPTION_KEY env var must be set to a 64-char hex string. ' +
      'Generate one with: openssl rand -hex 32',
    )
  }
  return Buffer.from(hex.slice(0, 64), 'hex')
}

/**
 * Encrypt plaintext. Returns `iv:authTag:ciphertext` (all hex-encoded).
 */
export function encrypt(text: string): string {
  const key    = getKey()
  const iv     = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const enc    = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

/**
 * Decrypt a value produced by `encrypt()`.
 */
export function decrypt(encoded: string): string {
  const key    = getKey()
  const parts  = encoded.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted string format')
  const [ivHex, tagHex, encHex] = parts
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return (
    decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') +
    decipher.final('utf8')
  )
}
