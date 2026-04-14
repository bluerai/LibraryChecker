'use strict'

import { CronJob } from 'cron';
import { pushover } from './pushover.js';
import { join } from 'path';
import fs from 'fs-extra';

import { log } from './log.js';
import { findEBooksToCheck } from '../app/model.js';
import { bulkUpdate, updateSearchItems, importData } from '../app/controller.js';
import { findSearchItems } from '../app/model.js';
import { BackupService } from '../backup/model.js';
import { getToday } from './searchForBooks.js';

let cronTab = readCronTab();

function readCronTab() {
  let cronFile = join(process.env.DATADIR, "config", "cron.json");
  if (fs.existsSync(cronFile))
    return fs.readJsonSync(cronFile);
  else
    return {};
}

export function writeToCronTab(jobName, cronTime, autoStart) {
  cronTab[jobName] = { cronTime, autoStart };
  let cronFile = join(process.env.DATADIR, "config", "cron.json");
  fs.writeJsonSync(cronFile, cronTab)
}

export function getAutoStart(jobName) {
  return cronTab[jobName]?.autoStart;
}

const queryTargets = [
  { kennung: 'THÜR', limit: process.env.QUERYLIMIT_THUER || 240 },
  { kennung: 'HESS', limit: process.env.QUERYLIMIT_HESS || 160 },
  { kennung: "GOET", limit: process.env.QUERYLIMIT_GOET || 40 },
  { kennung: 'DÜS', limit: process.env.QUERYLIMIT_DUES || 80 }
];

//--- Cron Jobs --------
export const cronJobs = new Map();

cronJobs.set(
  "checker",
  new CronJob(
    cronTab.checker?.cronTime || "0 0 1 1 0", // cronTime
    checkerJob22, // onTick
    null, // onComplete
    cronTab.checker?.autoStart || false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "Checker 22"
  ))

cronJobs.set(
  "fullChecker",
  new CronJob(
    cronTab.fullChecker?.cronTime || "0 0 1 1 0", // cronTime
    checkerJob999, // onTick
    null, // onComplete
    cronTab.fullChecker?.autoStart || false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "Checker 999"
  ))

cronJobs.set(
  "query",
  new CronJob(
    cronTab.query?.cronTime || "0 0 1 1 0", // cronTime
    queryJob, // onTick
    null, // onComplete
    cronTab.query?.autoStart || false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "Query"
  ))

cronJobs.set(
  "backup",
  new CronJob(
    cronTab.backup?.cronTime || "0 0 1 1 0", // cronTime
    backupJob, // onTick
    null, // onComplete
    cronTab.backup?.autoStart || false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "Backup"
  ))

cronJobs.set(
  "targetSearch",
  new CronJob(
    cronTab.targetSearch?.cronTime || "0 0 1 1 0", // cronTime
    targetSearchJob, // onTick
    null, // onComplete
    cronTab.targetSearch?.autoStart || false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "Target search"
  ))


cronJobs.values().forEach(j => {
  if (j.isActive) log.info(`Cron: Next ${j.context} job: ${j?.nextDate().toISO()}`);
});

// -- functions called by cron

async function checkerJob(days, kennungen) {        //Einzelprüfungen
  log.info("Cron: checkerJob starting ....")
  try {
    const items = await findEBooksToCheck(days, kennungen)  // die nächsten days Tage
    log.debug(`Cron: checkerJob: ${items.length} Einträge werden überprüft...`);

    const data = await bulkUpdate(items, 24);  //minWait in sec zwischen den Überprüfungen maxWait = 5 * minWait

    if (data.success) {
      log.debug(data.success);
      pushover.sysnote(data.success, `Library Checker Aktualisierung bis ${days} Tage`);

    } else {
      log.error(data.error);
      pushover.sysnote(data.error, `Library Checker Aktualisierung bis ${days} Tage`);
    }

  } catch (error) {
    const message = 'Cron: checkerJob fehlgeschlagen": ' + error.message;
    log.error(message);
    log.debug(error.stack);
    pushover.syserror(message);
  }
  log.info("Cron: checkerJob finished.")
}
function checkerJob22() { checkerJob(22, ["HESS", "DÜS", "THÜR", "GOET"]) }
function checkerJob999() { checkerJob(999, ["HESS", "DÜS", "THÜR", "GOET"]) }

async function queryJob() {
  log.info("Cron: queryJob starting ....")
  let success = new Set();

  for (const target of queryTargets) {
    log.info('Cron: queryJob:', target.kennung);

    if (!success.has(target.kennung)) {
      try {
        const result = await importData(target.kennung, target.limit);

        log.debug('Cron: queryJob:', target.kennung, result.succes);

        if (result.success) {
          if (result.available !== 0)
            pushover.sysinfo(result.success, `Online-Abfrage ${target.kennung}`);
          else
            pushover.sysnote(result.success, `Online-Abfrage ${target.kennung}`);

          success.add(target.kennung);
        }
        else
          pushover.sysnote(result.error, `Online-Abfrage ${target.kennung}`);

      } catch (error) {
        const message = `Cron: queryJob für ${target.kennung} fehlgeschlagen": ${error.message}`;
        log.error(message);
        log.debug(error.stack);
        //pushover.syserror(message);
      }

      await new Promise(r => setTimeout(r, 10 * 1000));
    }
  }

  log.info("Cron: queryJob finished.", success)
}

async function backupJob() {
  try {
    log.info("Cron: backupJob startet.", 'Library Checker');

    await BackupService.backupDatabase();

    const message = "Cron: Backup erfolgreich abgeschlossen.";
    pushover.sysnote(message, 'Library Checker Backup');

    log.info("Cron: backupJob finished", message);

  } catch (error) {
    const message = '"Cron: Backup fehlgeschlagen": ' + error.message;
    log.error(message);
    log.debug(error.stack);
    pushover.syserror(message, 'Library Checker');
  }
}

async function targetSearchJob() {
  try {
    log.info("Cron: targetSearchJob startet.");

    const items = await findSearchItems({ 'targetDate': getToday() });

    updateSearchItems(items);

    log.info("Cron: targetSearchJob finished.");

  } catch (error) {
    const message = '"Cron: targetSearchJob fehlgeschlagen": ' + error.message;
    log.error(message);
    log.debug(error.stack);
    pushover.syserror(message, 'Library Checker');
  }
}



