import express from 'express';
import { BackupController } from './controller.js';
import { backupCronJob } from '../utils/cron.js';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/log.js';

import { BackupService } from './model.js';

const router = express.Router();
const backupDir = process.env.CHECKLIB_BACKUPDIR || path.join(process.env.CHECKLIB_DATADIR, 'backup');

// Backup erstellen
router.post('/', async (req, res) => {
  try {
    const result = await BackupService.backupDatabase();
    res.json(result);
  } catch (error) {
    console.log("error: ", error);
    res.status(500).json({
      success: false,
      message: 'Backup creation failed',
      error: error.message
    });
  }
});

// Backup-Liste abrufen
router.get('/', async (req, res) => {
  try {
    const backups = await BackupService.listBackups();
    res.json({
      success: true,
      backups: backups.sort((a, b) => b.date - a.date)
    });
  } catch (error) {
    console.log("error: ", error);
    res.status(500).json({
      success: false,
      message: 'Failed to list backups',
      error: error.message
    });
  }
});

// Backup wiederherstellen
router.post('/:filename/restore', async (req, res) => {
  try {
    const result = await BackupService.restoreBackup(req.params.filename);
    res.json(result);
  } catch (error) {
    console.log("error: ", error);
    res.status(500).json({
      success: false,
      message: 'Restore failed',
      error: error.message
    });
  }
});

// Backup löschen
router.delete('/:filename', async (req, res) => {
  try {
    fs.unlink(path.join(backupDir, req.params.filename), (error) => {
      if (!error) res.json({ success: true });
    } );
  } catch (error) {
    console.log("error: ", error);
    res.status(500).json({
      success: false,
      message: 'Delete failed',
      error: error.message
    });
  }
});

// Backup herunterladen
router.get('/:filename/download', async (req, res) => {
  try {
    const filePath = path.join(backupDir, req.params.filename);
    res.download(filePath);
  } catch (error) {
    console.log("error: ", error);
    res.status(500).json({
      success: false,
      message: 'Download failed',
      error: error.message
    });
  }
});


// Automatische Backups aktivieren
(backupCronJob) && backupCronJob.start();

if (logger.isLevelEnabled('debug')) {
  try {
    (backupCronJob) && logger.debug(`Cron: Next backupCronJob: ${backupCronJob.nextDate().toISO()}`);
  } catch (error) {
    logger.error(error)
  }
}

export default router;