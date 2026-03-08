import { BackupService } from './model.js';

import { push } from '../utils/pushover.js';
import { logger } from '../utils/log.js';


export class BackupController {
  static async createBackup(req, res) {
    try {
      const result = await BackupService.backupDatabase();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Backup failed',
        error: error.message
      });
    }
  }

  static async listBackups(req, res) {
    try {
      const backups = await BackupService.listBackups();
      res.json({
        success: true,
        backups: backups.sort((a, b) => b.date - a.date)
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to list backups',
        error: error.message
      });
    }
  }

  static async restoreBackup(req, res) {
    try {
      const { filename } = req.params;
      const result = await BackupService.restoreBackup(filename);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Restore failed',
        error: error.message
      });
    }
  }

}