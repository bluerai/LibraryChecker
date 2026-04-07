'use strict'

import winston from 'winston';
import 'winston-daily-rotate-file';
import util from 'util';
import path from 'path';

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

const logdir = path.join(path.resolve(process.env.DATADIR || './data'), 'logs');

const consoleSilent = (process.env.LOG_TO_CONSOLE === "false") ? true : false;
const fileSilent = (process.env.LOG_TO_FILE === "true") ? false : true;

const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
);

const fileFormat = combine(
  errors({ stack: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  json()
);

const consoleTransport = new winston.transports.Console({
  format: consoleFormat,
  silent: consoleSilent,
});

const fileTransport = new winston.transports.DailyRotateFile({
  filename: `${logdir}/full_%DATE%.log`,
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  lazy: true,
  silent: fileSilent,
  format: fileFormat,
});

export const logger = winston.createLogger({
  level: process.env.LOGLEVEL || 'info',
  transports: [
    consoleTransport,
    fileTransport
  ]
});

const levels = ['error', 'warn', 'info', 'debug', 'silly'];

levels.forEach(level => {
  const original = logger[level].bind(logger);

  logger[level] = (...args) => {
    /* const message = util.format(...args); */
    const message = args.map(arg =>
      typeof arg === 'object'
        ? util.inspect(arg, { depth: null, colors: true })
        : arg
    ).join(' ');
    original(message);
  };
});

export default function log(...args) {   logger.info(...args); }
log.info = (...args) => logger.info(...args);
log.warn = (...args) => logger.warn(...args);
log.error = (...args) => logger.error(...args);
log.debug = (...args) => logger.debug(...args);
log.silly = (...args) => logger.silly(...args);/* 
export function info(...args) { logger.info(...args); }
export function warn(...args) { logger.warn(...args); }
export function error(...args) { logger.error(...args); }
export function debug(...args) { logger.debug(...args); }
export function silly(...args) { logger.silly(...args); } */

log.isLevelEnabled = (...args) => logger.isLevelEnabled(...args);

log(
  `Logging at level '${logger.level}'`,
  (consoleTransport.silent) ? "" : "to console",
  (!consoleTransport.silent && !fileTransport.silent) ? "and" : "",
  (fileTransport.silent) ? "" : "to file"
);



