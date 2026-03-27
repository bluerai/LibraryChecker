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

function checkerJob22() { checkerJob(22, ["HESS", "DÜS"]) }

export const checkerCronJob =
  (process.env.CRON_CHECKER) &&
  new CronJob(
    process.env.CRON_CHECKER, // cronTime
    checkerJob22, // onTick
    null, // onComplete
    false, // start
    process.env.TZ || "Europe/Berlin"// timeZone
  );

function checkerJob999() { checkerJob(999, ["HESS", "DÜS"]) }

export const fullCheckerCronJob =
  (process.env.CRON_FULLCHECKER) &&
  new CronJob(
    process.env.CRON_FULLCHECKER, // cronTime
    checkerJob999, // onTick
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

async function checkerJob(days, kennungen) {        //Einzelprüfungen
  if (await checkCassisHealth()) {
    try {
      const items = await findEBooksToCheck(days, kennungen)  // die nächsten days Tage
      logger.info(`Cron: checkerJob startet. Es werden ${items.length} Einträge überprüft.`);
      const data = await bulkUpdate(items, 24);  //minWait in sec zwischen den Überprüfungen maxWait = 5 * minWait

      if (data.success) {
        logger.info(data.success);
        push.sysnote(data.success, `Library Checker Aktualisierung bis ${days} Tage`);

      } else {
        logger.error(data.error);
        push.syswarn(data.error, `Library Checker Aktualisierung bis ${days} Tage`);
      }

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
