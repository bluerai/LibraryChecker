'use strict'

import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';

export const log_levels = ['error', 'warn', 'info', 'debug', 'silly'];

const { combine, timestamp, printf, colorize } = winston.format;

const logdir = path.join(path.resolve(process.env.CHECKLIB_DATADIR || './data'), 'logs');
const consoleSilent = !(process.env.LOG_TO_CONSOLE !== "false") || false;
const fileSilent = !(process.env.LOG_TO_FILE !== "false") || true;

export const consoleTransport = new winston.transports.Console({
  format: colorize({ all: true }),
  silent: consoleSilent,
});

export const fileTransport = new winston.transports.DailyRotateFile({
  filename: logdir + '/full_%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  lazy: true,
  silent: fileSilent,
});

export const logger = winston.createLogger({
  level: process.env.LOGLEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    printf((info) => `[${info.timestamp}] ${info.level}: ${info.message}`)
  ),
  transports: [
    consoleTransport,
    fileTransport
  ],
});

logger.info("Logging level: " + logger.level + ", logging to console: " + !consoleTransport.silent + ", logging to file: " + !fileTransport.silent);

