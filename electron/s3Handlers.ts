import { ipcMain, app, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const CREDENTIALS_FILENAME = 'finocurve-s3-credentials.json'

interface StoredCredentials {
  bucket: string
  region: string
  accessKeyId: string
  encryptedSecret: string
}

function getCredentialsPath(): string {
  return path.join(app.getPath('userData'), CREDENTIALS_FILENAME)
}

function loadCredentials(): StoredCredentials | null {
  try {
    const filePath = getCredentialsPath()
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as StoredCredentials
  } catch {
    return null
  }
}

function saveCredentials(bucket: string, region: string, accessKeyId: string, secret: string): void {
  const encryptedBuffer = safeStorage.encryptString(secret)
  const encryptedSecret = encryptedBuffer.toString('base64')
  const data: StoredCredentials = { bucket, region, accessKeyId, encryptedSecret }
  const filePath = getCredentialsPath()
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8')
}

function clearCredentials(): void {
  try {
    const filePath = getCredentialsPath()
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    /* ignore */
  }
}

function getS3Client(): S3Client | null {
  const creds = loadCredentials()
  if (!creds) return null
  const secret = safeStorage.decryptString(Buffer.from(creds.encryptedSecret, 'base64'))
  return new S3Client({
    region: creds.region,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: secret },
  })
}

/** Get file buffer from S3 - used by AI handlers */
/** Upload if credentials exist; returns whether upload ran successfully. */
export async function uploadS3IfConfigured(key: string, buffer: Uint8Array, contentType?: string): Promise<boolean> {
  const client = getS3Client()
  const creds = loadCredentials()
  if (!client || !creds) return false
  await client.send(
    new PutObjectCommand({
      Bucket: creds.bucket,
      Key: key,
      Body: Buffer.from(buffer),
      ContentType: contentType || 'application/octet-stream',
    })
  )
  return true
}

export async function getS3FileBuffer(key: string): Promise<{ buffer: number[]; contentType?: string } | null> {
  const client = getS3Client()
  const creds = loadCredentials()
  if (!client || !creds) return null
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: creds.bucket, Key: key }))
    const body = result.Body
    if (!body) return null
    const chunks: Uint8Array[] = []
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0)
    const buffer = new Uint8Array(totalLen)
    let offset = 0
    for (const c of chunks) {
      buffer.set(c, offset)
      offset += c.length
    }
    return { buffer: Array.from(buffer), contentType: result.ContentType }
  } catch {
    return null
  }
}

export function registerS3Handlers(): void {
  ipcMain.handle('s3-save-credentials', async (_event, payload: { bucket: string; region: string; accessKeyId: string; secret: string }) => {
    const { bucket, region, accessKeyId, secret } = payload
    if (!bucket || !region || !accessKeyId || !secret) {
      throw new Error('Missing required fields: bucket, region, accessKeyId, secret')
    }
    saveCredentials(bucket, region, accessKeyId, secret)
    return { ok: true }
  })

  ipcMain.handle('s3-clear-credentials', async () => {
    clearCredentials()
    return { ok: true }
  })

  ipcMain.handle('s3-has-credentials', async () => {
    const creds = loadCredentials()
    return !!creds
  })

  ipcMain.handle('s3-upload', async (_event, payload: { key: string; buffer: number[]; contentType?: string }) => {
    const client = getS3Client()
    if (!client) throw new Error('S3 credentials not configured')
    const creds = loadCredentials()
    if (!creds) throw new Error('S3 credentials not configured')

    const { key, buffer, contentType } = payload
    const body = Buffer.from(buffer)
    await client.send(new PutObjectCommand({
      Bucket: creds.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    }))
    return { ok: true }
  })

  ipcMain.handle('s3-list', async (_event, payload: { prefix: string }) => {
    const client = getS3Client()
    if (!client) throw new Error('S3 credentials not configured')
    const creds = loadCredentials()
    if (!creds) throw new Error('S3 credentials not configured')

    const { prefix } = payload
    const result = await client.send(new ListObjectsV2Command({
      Bucket: creds.bucket,
      Prefix: prefix || '',
    }))

    const items = (result.Contents || []).map((obj) => ({
      key: obj.Key!,
      size: obj.Size ?? 0,
      lastModified: obj.LastModified?.toISOString() ?? '',
    }))
    return { items }
  })

  ipcMain.handle('s3-get-file-buffer', async (_event, payload: { key: string }) => {
    const result = await getS3FileBuffer(payload.key)
    if (!result) throw new Error('Failed to get file from S3')
    return result
  })

  ipcMain.handle('s3-get-download-url', async (_event, payload: { key: string }) => {
    const client = getS3Client()
    if (!client) throw new Error('S3 credentials not configured')
    const creds = loadCredentials()
    if (!creds) throw new Error('S3 credentials not configured')

    const { key } = payload
    const command = new GetObjectCommand({ Bucket: creds.bucket, Key: key })
    const url = await getSignedUrl(client, command, { expiresIn: 3600 })
    return { url }
  })

  ipcMain.handle('s3-delete', async (_event, payload: { key: string }) => {
    const client = getS3Client()
    if (!client) throw new Error('S3 credentials not configured')
    const creds = loadCredentials()
    if (!creds) throw new Error('S3 credentials not configured')

    const { key } = payload
    await client.send(new DeleteObjectCommand({ Bucket: creds.bucket, Key: key }))
    return { ok: true }
  })
}
