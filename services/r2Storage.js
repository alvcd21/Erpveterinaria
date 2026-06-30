'use strict';

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

let _client = null;

function getClient() {
    if (_client) return _client;
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 no configurado: faltan R2_ACCOUNT_ID, R2_ACCESS_KEY_ID o R2_SECRET_ACCESS_KEY en .env');
    }
    _client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
    return _client;
}

function getBucket() {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) throw new Error('R2_BUCKET_NAME no configurado en .env');
    return bucket;
}

function safeExtension(filename, fallback = 'jpg') {
    const ext = String(filename || '').split('.').pop()?.toLowerCase() || fallback;
    const safe = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'dcm'].includes(ext) ? ext : fallback;
    return safe;
}

function generateKey(tenantId, medicamentoId, filename) {
    const safe = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(safeExtension(filename)) ? safeExtension(filename) : 'jpg';
    const uid = crypto.randomBytes(12).toString('hex');
    return `medicamentos/${tenantId}/${medicamentoId}/${uid}.${safe}`;
}

function generateFileKey({ tenantId, folder = 'archivos', ownerId = 'general', filename }) {
    const safeFolder = String(folder || 'archivos').replace(/[^a-zA-Z0-9/_-]+/g, '-').replace(/^\/+|\/+$/g, '');
    const safeOwner = String(ownerId || 'general').replace(/[^a-zA-Z0-9_-]+/g, '-');
    const uid = crypto.randomBytes(12).toString('hex');
    return `${safeFolder}/${tenantId}/${safeOwner}/${uid}.${safeExtension(filename, 'bin')}`;
}

async function uploadImage({ base64, mime, tenantId, medicamentoId, filename }) {
    const client = getClient();
    const bucket = getBucket();
    const buffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const key = generateKey(tenantId, medicamentoId, filename);
    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mime || 'image/jpeg',
        CacheControl: 'public, max-age=31536000',
    }));
    return key;
}

async function uploadFile({ base64, mime, tenantId, folder, ownerId, filename }) {
    const client = getClient();
    const bucket = getBucket();
    const buffer = Buffer.from(String(base64 || '').replace(/^data:[^;]+;base64,/, ''), 'base64');
    const key = generateFileKey({ tenantId, folder, ownerId, filename });
    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mime || 'application/octet-stream',
        CacheControl: 'private, max-age=3600',
    }));
    return key;
}

async function deleteImage(key) {
    if (!key) return;
    const client = getClient();
    await client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

async function getSignedImageUrl(key, expiresInSeconds = 3600) {
    const client = getClient();
    const command = new GetObjectCommand({ Bucket: getBucket(), Key: key });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

async function downloadImage(key) {
    const client = getClient();
    const response = await client.send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
    const chunks = [];
    for await (const chunk of response.Body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return {
        buffer: Buffer.concat(chunks),
        contentType: response.ContentType || 'image/jpeg',
    };
}

module.exports = { uploadImage, uploadFile, deleteImage, getSignedImageUrl, downloadImage };
