import { ipcMain, app, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const CREDENTIALS_FILENAME = 'finocure-s3-credentials.json'

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
