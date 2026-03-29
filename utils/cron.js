'use strict'

import { CronJob } from 'cron';

import { push } from './pushover.js';
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
    false, // start
    process.env.TZ || "Europe/Berlin"// timeZone
  );

export const fullCheckerCronJob =
  (process.env.CRON_FULLCHECKER) &&
  new CronJob(
    process.env.CRON_FULLCHECKER, // cronTime
    checkerJob999, // onTick
    null, // onComplete
    false, // start
    process.env.TZ || "Europe/Berlin"// timeZone
  );

const queryTargets = [
  //{ kennung: 'THÜR', limit: 80 },
  { kennung: 'HESS', limit: 80 },
  { kennung: 'DÜS', limit: 80 },
  //{ kennung: "GOET", limit: 40 }
];

export const queryCronJob =
  (process.env.CRON_QUERY) &&
  new CronJob(
    process.env.CRON_QUERY, // cronTime
    queryJob, // onTick
    null, // onComplete
    false, // start
    process.env.TZ || "Europe/Berlin"// timeZone
  );

export const backupCronJob =
  (process.env.CRON_BACKUP) &&
  new CronJob(
    process.env.CRON_BACKUP, // cronTime
    backupJob, // onTick
    null, // onComplete
    false, // start
    process.env.TZ || "Europe/Berlin"// timeZone
  );


export const targetSearchCronJob =
  (process.env.CRON_TARGETSEARCH) &&
  new CronJob(
    process.env.CRON_TARGETSEARCH, // cronTime
    targetSearchJob, // onTick
    null, // onComplete
    true, // start
    process.env.TZ || "Europe/Berlin"// timeZone
  );

export const targetSearchCronJob2 =
  (process.env.CRON_TARGETSEARCH2) &&
  new CronJob(
    process.env.CRON_TARGETSEARCH2, // cronTime
    targetSearchJob, // onTick
    null, // onComplete
    true, // start
    process.env.TZ || "Europe/Berlin"// timeZone
  );

//--- Job to call by Cron Jobs--------

async function checkerJob(days, kennungen) {        //Einzelprüfungen
  if (await checkCassisHealth()) {
    try {
      const items = await findEBooksToCheck(days, kennungen)  // die nächsten days Tage
      log(`Cron: checkerJob startet. Es werden ${items.length} Einträge überprüft.`);
      const data = await bulkUpdate(items, 24);  //minWait in sec zwischen den Überprüfungen maxWait = 5 * minWait

      if (data.success) {
        log(data.success);
        push.sysnote(data.success, `Library Checker Aktualisierung bis ${days} Tage`);

      } else {
        log.error(data.error);
        push.syswarn(data.error, `Library Checker Aktualisierung bis ${days} Tage`);
      }

    } catch (error) {
      const message = 'Cron: checkerJob fehlgeschlagen": ' + error.message;
      log.error(message);
      log.debug(error.stack);
      push.syserror(message);
    }
  } else {
    push.sysinfo(`checkerJob: Error accessing Cassis host`, `Check_lib`);
  }
}

function checkerJob22() { checkerJob(22, ["HESS", "DÜS"]) }
function checkerJob999() { checkerJob(999, ["HESS", "DÜS"]) }


async function queryJob() {
  if (await checkCassisHealth()) {
    for (const target of queryTargets) {
      try {
        const result = await importData(target.kennung, target.limit);

        log(`queryJob: Online-Abfrage ${target.kennung}: ${result.message}`);

        if (result.available > 0)
          push.sysinfo(result.message, `Online-Abfrage ${target.kennung}`);
        else
          push.sysnote(result.message, `Online-Abfrage ${target.kennung}`);

      } catch (error) {
        const message = `Cron: queryJob für ${target.kennung} fehlgeschlagen": ${error.message}`;
        log.error(message);
        log.debug(error.stack);
        //push.syserror(message);
      }
    }
  } else {
    push.sysinfo(`queryJob: Error accessing Cassis host`, `Check_lib`);
  }
}

async function backupJob() {
  try {
    log("Cron: backupJob startet.", 'Library Checker');

    await BackupService.backupDatabase();

    const message = "Cron: Backup erfolgreich abgeschlossen.";
    log(message);
    push.sysnote(message, 'Library Checker Backup');

  } catch (error) {
    const message = '"Cron: Backup fehlgeschlagen": ' + error.message;
    log.error(message);
    log.debug(error.stack);
    push.syserror(message, 'Library Checker');
  }
}

async function targetSearchJob() {
  try {
    log("Cron: targetSearchJob startet.");

    const items = await findSearchItems({ 'targetDate': getToday() });

    updateSearchItems(items);

  } catch (error) {
    const message = '"Cron: targetSearchJob fehlgeschlagen": ' + error.message;
    log.error(message);
    log.debug(error.stack);
    push.syserror(message, 'Library Checker');
  }
}

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
