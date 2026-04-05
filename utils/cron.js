'use strict'

import { CronJob } from 'cron';

import { pushover } from './pushover.js';
import { log } from './log.js';

import { findEBooksToCheck } from '../app/model.js';
import { bulkUpdate, updateSearchItems, importData } from '../app/controller.js';
import { findSearchItems } from '../app/model.js';
import { BackupService } from '../backup/model.js';
import { getToday } from './searchForBooks.js';

//--- Cron Jobs --------

export const checkerCronJob =
  (process.env.CRON_CHECKER) &&
  new CronJob(
    process.env.CRON_CHECKER, // cronTime
    checkerJob22, // onTick
    null, // onComplete
    false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "checkerCronJob"
  );

export const fullCheckerCronJob =
  (process.env.CRON_FULLCHECKER) &&
  new CronJob(
    process.env.CRON_FULLCHECKER, // cronTime
    checkerJob999, // onTick
    null, // onComplete
    false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "fullCheckerCronJob"
  );

const queryTargets = [
  { kennung: 'THÜR', limit: 80 },
  { kennung: 'HESS', limit: 80 },
  { kennung: "GOET", limit: 40 },
  { kennung: 'DÜS', limit: 80 }
];

export const queryCronJob =
  (process.env.CRON_QUERY) &&
  new CronJob(
    process.env.CRON_QUERY, // cronTime
    queryJob, // onTick
    null, // onComplete
    false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "queryCronJob"
  );

export const backupCronJob =
  (process.env.CRON_BACKUP) &&
  new CronJob(
    process.env.CRON_BACKUP, // cronTime
    backupJob, // onTick
    null, // onComplete
    false, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "backupCronJob"
  );


export const targetSearchCronJob =
  (process.env.CRON_TARGETSEARCH) &&
  new CronJob(
    process.env.CRON_TARGETSEARCH, // cronTime
    targetSearchJob, // onTick
    null, // onComplete
    true, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "targetSearchCronJob"
  );

export const targetSearchCronJob2 =
  (process.env.CRON_TARGETSEARCH2) &&
  new CronJob(
    process.env.CRON_TARGETSEARCH2, // cronTime
    targetSearchJob, // onTick
    null, // onComplete
    true, // automatisch starten
    process.env.TZ || "Europe/Berlin", // timeZone
    "targetSearchCronJob2"
  );

//--- Job to call by Cron Jobs--------

async function checkerJob(days, kennungen) {        //Einzelprüfungen
  console.log("checkerJob starting ....")
  let retries = 0;
  while (++retries <= 3)
    try {
      const items = await findEBooksToCheck(days, kennungen)  // die nächsten days Tage
      log(`Cron: checkerJob: ${items.length} Einträge werden überprüft...`);

      const data = await bulkUpdate(items, 24);  //minWait in sec zwischen den Überprüfungen maxWait = 5 * minWait

      if (data.success) {
        log(data.success);
        pushover.sysnote(data.success, `Library Checker Aktualisierung bis ${days} Tage`);
        break;

      } else {
        log.error(data.error);
        pushover.syswarn(data.error, `Library Checker Aktualisierung bis ${days} Tage`);
      }

    } catch (error) {
      const message = 'Cron: checkerJob fehlgeschlagen": ' + error.message;
      log.error(message);
      log.debug(error.stack);
      pushover.syserror(message);
    }
  console.log("checkerJob finished.")
}


function checkerJob22() { checkerJob(22, ["HESS", "DÜS", "THÜR", "GOET"]) }
function checkerJob999() { checkerJob(999, ["HESS", "DÜS", "THÜR", "GOET"]) }


async function queryJob() {
  console.log("queryJob starting ....")
  let success = new Set();

  let retries = 0;
  while (++retries <= 3) {
    for (const target of queryTargets) {
      console.log('retries:', retries, 'kennung:', target.kennung);

      if (!success.has(target.kennung)) {
        try {
          const result = await importData(target.kennung, target.limit);

          log(`queryJob: Online-Abfrage ${target.kennung}: ${result.message}`);

          if (result.success) {
            if (result.avaiable !== 0)
              pushover.sysinfo(result.success, `Online-Abfrage ${target.kennung}`);
            else
              pushover.sysnote(result.success, `Online-Abfrage ${target.kennung}`);

            success.add(target.kennung);
          }
          else
            pushover.syswarn(result.error, `Online-Abfrage ${target.kennung}`);

        } catch (error) {
          const message = `Cron: queryJob für ${target.kennung} fehlgeschlagen": ${error.message}`;
          log.error(message);
          log.debug(error.stack);
          //pushover.syserror(message);
        }

        await new Promise(r => setTimeout(r, 10 * 1000));
      }
    }
    if (success.size == 4) break;
  }
  console.log("queryJob finished.", success)
}

export async function backupJob() {
  try {
    log("Cron: backupJob startet.", 'Library Checker');

    await BackupService.backupDatabase();

    const message = "Cron: Backup erfolgreich abgeschlossen.";
    log(message);
    pushover.sysnote(message, 'Library Checker Backup');

  } catch (error) {
    const message = '"Cron: Backup fehlgeschlagen": ' + error.message;
    log.error(message);
    log.debug(error.stack);
    pushover.syserror(message, 'Library Checker');
  }
}

export async function targetSearchJob() {
  try {
    log("Cron: targetSearchJob startet.");

    const items = await findSearchItems({ 'targetDate': getToday() });

    updateSearchItems(items);

  } catch (error) {
    const message = '"Cron: targetSearchJob fehlgeschlagen": ' + error.message;
    log.error(message);
    log.debug(error.stack);
    pushover.syserror(message, 'Library Checker');
  }
}

/* 
async function checkCassisHealth() {
  try {
    const host = process.env.CASSIS_HOST;
    if (!host) {
      throw new Error(`Enviroment variable CASSIS_HOST not set.`)
    }
    const result = await fetch(`http://${host}/api/health`); //{"healthy":true}
    const data = await result.json();
    if (data.healthy)
      log(`Cassis host ${host} found & working correctly.`);
    else
      log.error(`Cassis-Server not healthy.`)
    return (data.healthy);
  } catch (error) {
    console.error(`Error accessing Cassis host at ${process.env.CASSIS_HOST}.`);
    return false;
  }
}
 */

// Starten


export let cronJobs = [
  queryCronJob, checkerCronJob, fullCheckerCronJob, targetSearchCronJob, backupCronJob
];

//cronJobs
(checkerCronJob) &&
  checkerCronJob.start();
log.info(`Cron: Next checkerCronJob: ${checkerCronJob?.nextDate().toISO()}`);

(fullCheckerCronJob) &&
  fullCheckerCronJob.start();
log.info(`Cron: Next fullCheckerCronJob: ${fullCheckerCronJob?.nextDate().toISO()}`);

(queryCronJob) &&
  queryCronJob.start();
log.info(`Cron: Next queryCronJob: ${queryCronJob?.nextDate().toISO()}`);

(targetSearchCronJob) &&
  targetSearchCronJob.start();
log.info(`Cron: Next targetSearchCronJob: ${targetSearchCronJob?.nextDate().toISO()}`);

(backupCronJob) &&
  backupCronJob.start();
log.info(`Cron: Next backupCronJob: ${backupCronJob?.nextDate().toISO()}`);

