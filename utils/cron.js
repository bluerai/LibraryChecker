'use strict'

import { CronJob } from 'cron';

import { pushover } from './pushover.js';
import log from './log.js';

import { findEBooksToCheck } from '../app/model.js';
import { bulkUpdate, updateSearchItems, importData } from '../app/controller.js';
import { findSearchItems } from '../app/model.js';
import { BackupService } from '../backup/model.js';
import { getToday } from './searchForBooks.js';

const queryTargets = [
  { kennung: 'THÜR', limit: process.env.QUERYLIMIT_THUER || 240 },
  { kennung: 'HESS', limit: process.env.QUERYLIMIT_HESS || 160 },
  { kennung: "GOET", limit: process.env.QUERYLIMIT_GOET || 40 },
  { kennung: 'DÜS', limit: process.env.QUERYLIMIT_DUES || 80 }
];

//--- Cron Jobs --------

export const checkerCronJob =
  new CronJob(
    process.env.CRON_CHECKER || "0 0 1 1 0", // cronTime
    checkerJob22, // onTick
    null, // onComplete
    false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "checkerCronJob"
  );
if (process.env.CRON_CHECKER) checkerCronJob.start();
if (checkerCronJob.isActive) log.info(`Cron: Next checkerCronJob: ${checkerCronJob?.nextDate().toISO()}`);


export const fullCheckerCronJob =
  new CronJob(
    process.env.CRON_FULLCHECKER || "0 0 1 1 0", // cronTime
    checkerJob999, // onTick
    null, // onComplete
    false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "fullCheckerCronJob"
  );
if (process.env.CRON_FULLCHECKER) fullCheckerCronJob.start();
if (fullCheckerCronJob.isActive) log.info(`Cron: Next fullCheckerCronJob: ${fullCheckerCronJob?.nextDate().toISO()}`);


export const queryCronJob =
  new CronJob(
    process.env.CRON_QUERY || "0 0 1 1 0", // cronTime
    queryJob, // onTick
    null, // onComplete
    false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "queryCronJob"
  );
if (process.env.CRON_QUERY) queryCronJob.start();
if (queryCronJob.isActive) log.info(`Cron: Next checkerCronJob: ${queryCronJob?.nextDate().toISO()}`);


export const backupCronJob =
  new CronJob(
    process.env.CRON_BACKUP || "0 0 1 1 0", // cronTime
    backupJob, // onTick
    null, // onComplete
    false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "backupCronJob"
  );
if (process.env.CRON_BACKUP) backupCronJob.start();
if (backupCronJob.isActive) log.info(`Cron: Next backupCronJob: ${backupCronJob?.nextDate().toISO()}`);


export const targetSearchCronJob =
  new CronJob(
    process.env.CRON_TARGETSEARCH || "0 0 1 1 0", // cronTime
    targetSearchJob, // onTick
    null, // onComplete
    false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "targetSearchCronJob"
  );
if (process.env.CRON_TARGETSEARCH) targetSearchCronJob.start();
if (targetSearchCronJob.isActive) log.info(`Cron: Next targetSearchCronJob: ${targetSearchCronJob?.nextDate().toISO()}`);

export const cronJobs = [
  queryCronJob, checkerCronJob, fullCheckerCronJob, targetSearchCronJob, backupCronJob
];

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
    log.debug('Cron: queryJob:', target.kennung);

    if (!success.has(target.kennung)) {
      try {
        const result = await importData(target.kennung, target.limit);

        log.debug('Cron: queryJob:',  target.kennung, result.message);

        if (result.success) {
          if (result.avaiable !== 0)
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



