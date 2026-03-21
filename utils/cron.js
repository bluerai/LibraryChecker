'use strict'

import { CronJob } from 'cron';

import { push } from './pushover.js';
import { logger } from './log.js';

import { findEBooksToCheck } from '../app/model.js';
import { bulkUpdate, updateSearchItems } from '../app/controller.js';
import { findSearchItems } from '../app/model.js';
import { BackupService } from '../backup/model.js';
import { getToday } from './searchForBooks.js';

export const queryCronJob =
  (process.env.CRON_QUERY) &&
  new CronJob(
    process.env.CRON_QUERY, // cronTime
    queryJob, // onTick
    null, // onComplete
    false, // start
    process.env.TZ || "Europe/Berlin"// timeZone
  );


export const checkerCronJob =
  (process.env.CRON_CHECKER) &&
  new CronJob(
    process.env.CRON_CHECKER, // cronTime
    checkerJob, // onTick
    null, // onComplete
    false, // start
    process.env.TZ || "Europe/Berlin"// timeZone
  );

export const fullCheckerCronJob =
  (process.env.CRON_FULLCHECKER) &&
  new CronJob(
    process.env.CRON_FULLCHECKER, // cronTime
    fullCheckerJob, // onTick
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

const targets = [
  //{ kennung: 'HESS', count: 200 },
  //{ kennung: 'DÜS', count: 100 },
  //{ kennung: "GOET", count: 50 },
  // kennung: 'THÜR', count: 300 }
];

async function checkerJob() {        //Einzelprüfungen
  if (await checkCassisHealth()) {
    try {
      const items = await findEBooksToCheck(22)  // die nächsten 22 Tage
      logger.info(`Cron: checkerJob startet. Es werden ${items.length} Einträge überprüft.`);
      const { checkedCount, availCount } = await bulkUpdate(items, 32);  //wait in sec zwischen den Überprüfungen
      const message = `Cron: ${checkedCount} Bücher überprüft - ${availCount} Bücher sind aktuell verfügbar`;
      logger.info(message);
      push.sysnote(message, "Library Checker Prüfung bis 22. Tag");
    } catch (error) {
      const message = 'Cron: checkerJob fehlgeschlagen": ' + error.message;
      logger.error(message);
      logger.debug(error.stack);
      push.syserror(message);
    }
  } else {
    push.sysinfo(`checkerJob: Error accessing Cassis host`, `Check_lib`);
  }
}


async function fullCheckerJob() {
  if (await checkCassisHealth()) {
    try {
      const items = await findEBooksToCheck(9999);
      logger.info(`Cron: checkerJob startet. Es werden ${items.length} Einträge überprüft.`);
      const { checkedCount, availCount } = await bulkUpdate(items, 32); //wait in sec zwischen den Überprüfungen
      const message = `Bücher: überprüft: ${checkedCount}, davon verfügbar: ${availCount}`;
      logger.info(message);
      push.sysnote(message, "Library Checker Komplett-Prüfung");

    } catch (error) {
      const message = 'Cron: fullCheckerJob fehlgeschlagen": ' + error.message;
      logger.error(message);
      logger.debug(error.stack);
      push.syserror(message);
    }
  } else {
    push.sysinfo(`fullCheckerJob: Error accessing Cassis host`, `Check_lib`);
  }
}

async function backupJob() {
  try {
    logger.info("Cron: backupJob startet.", 'Library Checker');

    await BackupService.backupDatabase();

    const message = "Cron: Backup erfolgreich abgeschlossen.";
    logger.info(message);
    push.sysnote(message, 'Library Checker Backup');

  } catch (error) {
    const message = '"Cron: Backup fehlgeschlagen": ' + error.message;
    logger.error(message);
    logger.debug(error.stack);
    push.syserror(message, 'Library Checker');
  }
}

async function targetSearchJob() {
  try {
    logger.info("Cron: targetSearchJob startet.");

    const items = await findSearchItems({ 'targetDate': getToday() });

    updateSearchItems(items);

  } catch (error) {
    const message = '"Cron: targetSearchJob fehlgeschlagen": ' + error.message;
    logger.error(message);
    logger.debug(error.stack);
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
      logger.info(`Cassis host ${host} found & working correctly.`);
    else
      logger.error(`Cassis-Server not healthy.`)
    return (data.healthy);
  } catch (error) {
    console.error(`Error accessing Cassis host at ${process.env.CASSIS_HOST}.`);
    return false;
  }
}
