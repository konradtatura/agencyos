/**
 * Tally-specific AES-256-GCM encryption.
 * Uses TALLY_ENCRYPTION_KEY (separate from the shared ENCRYPTION_KEY) so the
 * Tally API key stored in DB can be rotated independently.
 *
 * Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>  (same as lib/encryption.ts)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.TALLY_ENCRYPTION_KEY
  if (!hex) throw new Error('TALLY_ENCRYPTION_KEY env var is not set')
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error('TALLY_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)')
  }
  return key
}

export function tallyEncrypt(plaintext: string): string {
  const key = getKey()
  const iv  = randomBytes(16)

  const cipher    = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag   = cipher.getAuthTag()

  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function tallyDecrypt(ciphertext: string): string {
  const key    = getKey()
  const parts  = ciphertext.split(':')

  if (parts.length !== 3) throw new Error('Invalid ciphertext format — expected iv:authTag:data')

  const [ivHex, authTagHex, encryptedHex] = parts
  const iv        = Buffer.from(ivHex,        'hex')
  const authTag   = Buffer.from(authTagHex,   'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
