'use strict';

const { google } = require('googleapis');
const { getSystemConfig } = require('../config/systemConfig');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

const execFileAsync = util.promisify(execFile);

function parseDatabaseUrl(databaseUrl) {
    const url = new URL(databaseUrl);
    return {
        host: url.hostname,
        port: url.port || '5432',
        database: url.pathname.replace(/^\//, ''),
        user: decodeURIComponent(url.username || ''),
        password: decodeURIComponent(url.password || ''),
        sslmode: url.searchParams.get('sslmode') || 'require',
    };
}

async function backupDatabase() {
    const keyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!keyBase64) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY no está configurado. Agrega la clave de servicio de Google en base64.');
    }

    let serviceAccount;
    try {
        serviceAccount = JSON.parse(Buffer.from(keyBase64, 'base64').toString('utf8'));
    } catch (err) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY no es un JSON válido en base64: ' + err.message);
    }

    const auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `smartcloud_backup_${timestamp}.sql`;
    const tempFilePath = path.join(os.tmpdir(), backupFilename);

    try {
        let pgDumpArgs;
        let pgDumpEnv = { ...process.env };
        if (process.env.DATABASE_URL) {
            const db = parseDatabaseUrl(process.env.DB_INTERNAL_URL || process.env.DATABASE_URL);
            pgDumpArgs = [
                '-h', db.host,
                '-p', db.port,
                '-U', db.user,
                '-d', db.database,
                '--no-password',
                '-f', tempFilePath,
            ];
            pgDumpEnv.PGPASSWORD = db.password;
            pgDumpEnv.PGSSLMODE = process.env.DB_INTERNAL_URL ? 'disable' : db.sslmode;
        } else {
            pgDumpArgs = [
                '-h', process.env.DB_HOST,
                '-U', process.env.DB_USER,
                '-d', process.env.DB_NAME,
                '-p', process.env.DB_PORT || '5432',
                '--no-password',
                '-f', tempFilePath,
            ];
            pgDumpEnv.PGPASSWORD = process.env.DB_PASSWORD || '';
        }

        try {
            await execFileAsync('pg_dump', pgDumpArgs, { env: pgDumpEnv });
        } catch (pgErr) {
            console.error('[googleDriveService] pg_dump no disponible o falló:', pgErr.message);
            return { success: false, error: 'pg_dump falló: ' + pgErr.message };
        }

        const { driveFolderId } = await getSystemConfig();
        const fileMetadata = {
            name: backupFilename,
            parents: [driveFolderId],
        };
        const media = {
            mimeType: 'application/sql',
            body: fs.createReadStream(tempFilePath),
        };

        const uploaded = await drive.files.create({
            resource: fileMetadata,
            media,
            fields: 'id,webViewLink,size',
        });

        return {
            success: true,
            filename: backupFilename,
            fileId: uploaded.data.id,
            webViewLink: uploaded.data.webViewLink,
            size: uploaded.data.size,
        };
    } finally {
        try {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch (cleanupErr) {
            console.warn('[googleDriveService] No se pudo eliminar el archivo temporal:', cleanupErr.message);
        }
    }
}

async function deleteOldBackups(retentionDays = 30) {
    const keyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!keyBase64) return 0;

    let serviceAccount;
    try {
        serviceAccount = JSON.parse(Buffer.from(keyBase64, 'base64').toString('utf8'));
    } catch (err) {
        console.error('[googleDriveService] Clave de servicio inválida al limpiar backups:', err.message);
        return 0;
    }

    const auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const { driveFolderId: folderId } = await getSystemConfig();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffISO = cutoffDate.toISOString();

    let deletedCount = 0;
    try {
        const listRes = await drive.files.list({
            q: `'${folderId}' in parents and createdTime < '${cutoffISO}' and name contains 'smartcloud_backup_' and trashed = false`,
            fields: 'files(id,name,createdTime)',
            spaces: 'drive',
        });

        const files = listRes.data.files || [];
        for (const file of files) {
            try {
                await drive.files.delete({ fileId: file.id });
                console.log(`[googleDriveService] Backup eliminado: ${file.name}`);
                deletedCount++;
            } catch (delErr) {
                console.error(`[googleDriveService] Error al eliminar ${file.name}:`, delErr.message);
            }
        }
    } catch (err) {
        console.error('[googleDriveService] Error al listar backups antiguos:', err.message);
    }

    return deletedCount;
}

module.exports = { backupDatabase, deleteOldBackups };
