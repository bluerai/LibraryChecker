import { DB } from '../app/model.js';
import { gzip, gunzip } from 'zlib';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

import { log } from '../utils/log.js';

const gzipPromise = promisify(gzip);
const gunzipPromise = promisify(gunzip);

export class BackupService {
  static async backupDatabase() {
    const collections = await DB.listCollections().toArray();
    const backup = {};

    // Alle Collections lesen
    for (const collection of collections) {
      const docs = await DB.collection(collection.name).find({}).toArray();
      backup[collection.name] = docs;
    }

    // Backup-Verzeichnis erstellen
    const backupDir = process.env.CHECKLIB_BACKUPDIR || path.join(process.env.DATADIR, 'backup');
    await fs.mkdir(backupDir, { recursive: true });

    // Dateiname mit Zeitstempel
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `backup-${timestamp}.json.gz`;
    const backupPath = path.join(backupDir, backupFile);

    try {
      // Daten komprimieren und speichern
      const jsonData = JSON.stringify(backup, null, 2);
      const compressed = await gzipPromise(jsonData);
      await fs.writeFile(backupPath, compressed);

      // Alte Backups aufräumen
      await this.cleanupBackups(backupDir);

      return { success: true, path: backupPath };
    } catch (error) {
      log.error('Backup failed:', error);
      throw error;
    }
  }

  static async cleanupBackups(backupDir) {
    try {
      const files = await fs.readdir(backupDir);

      // Erstelle ein Array von Promises für die Stat-Infos
      const fileStatsPromises = files
        .filter(file => file.startsWith('backup-') && file.endsWith('.json.gz'))
        .map(async file => {
          const filePath = path.join(backupDir, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            path: filePath,
            time: stats.mtimeMs
          };
        });

      // Warte auf alle Stat-Operationen
      const backupFiles = await Promise.all(fileStatsPromises);

      // Sortiere nach Zeit (neueste zuerst)
      backupFiles.sort((a, b) => b.time - a.time);

      // Nur letzten 7 Backups behalten
      const toDelete = backupFiles.slice(7);
      await Promise.all(
        toDelete.map(file => fs.unlink(file.path).catch(log.error))
      );
    } catch (error) {
      log.error('Backup cleanup error:', error);
      throw error;
    }
  }

  static async listBackups() {
    const backupDir = process.env.CHECKLIB_BACKUPDIR || path.join(process.env.DATADIR, 'backup');
    try {
      const files = await fs.readdir(backupDir);
      return Promise.all(
        files
          .filter(file => file.startsWith('backup-') && file.endsWith('.json.gz'))
          .map(async file => {
            const filePath = path.join(backupDir, file);
            const stats = await fs.stat(filePath);
            return {
              name: file,
              size: stats.size,
              date: stats.mtime,
              path: filePath
            };
          })
      );
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  static async restoreBackup(filename) {
    const backupDir = process.env.CHECKLIB_BACKUPDIR || path.join(process.env.DATADIR, 'backup');
    const filePath = path.join(backupDir, filename);

    try {
      // Backup lesen und dekomprimieren
      const compressed = await fs.readFile(filePath);
      const jsonData = await gunzipPromise(compressed);
      const backupData = JSON.parse(jsonData);

      // Datenbank zurücksetzen
      await DB.dropDatabase();

      // Daten wiederherstellen
      await Promise.all(
        Object.entries(backupData).map(async ([collectionName, documents]) => {
          if (documents.length > 0) {
            for (let doc of documents) {
              // _id entfwernen, damit beim Insert neue _ids (mit ObjectId(...) ) erstellt werden
              delete doc._id;
              if ("book" in doc) {
                doc.mediaData = doc.book; // Neuen Key erstellen
                delete doc.book;
              }
              if ("result" in doc) {
                doc.mediaData = doc.result; // Neuen Key erstellen
                delete doc.result;
              }
              if (!("mediaType" in doc)) {
                doc.mediaType = 'eBook';
              }
            }
            await DB.collection(collectionName).insertMany(documents);
          }
        })
      );

      return { success: true };
    } catch (error) {
      log.error('Restore failed:', error);
      throw error;
    }
  }
}