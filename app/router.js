import express from 'express';

import { checkerCronJob, fullCheckerCronJob, queryCronJob } from '../utils/cron.js';
import { logger } from '../utils/log.js';

import {
  homeAction, listAction, htmlFileAction, jsonFileAction, importHtmlAction, importJsonAction, upsertAction, updateAction, markAsDoneAction, markAsReservedAction,
  resetAction, clearAction, deleteAction, itemAction, fullSearchAction, changeAction, upsertSearchItemAction,
  getWaitlistAction, deleteSearchItemAction, updWaitListAction
} from './controller.js';
import upload from '../utils/uploadConfig.js';


const router = express.Router();

router.get('/', homeAction);
router.get('/list', listAction);
router.post('/imp/html', importHtmlAction);
router.post('/imp/json', importJsonAction);
router.post('/menu', itemAction);
router.post('/upd', updateAction);
router.post('/upsert', upsertAction);
router.post('/done', markAsDoneAction);
router.post('/change', changeAction);
router.post('/reserved', markAsReservedAction);
router.post('/reset', resetAction);
router.post('/clear', clearAction);
router.post('/del', deleteAction);
router.post('/search', fullSearchAction);
router.post('/upl/html', upload.single('searchlistFile'), htmlFileAction);
router.post('/upl/json', upload.single('jsonlistFile'), jsonFileAction);

router.post('/waitlist/upsert', upsertSearchItemAction);
router.post('/waitlist/del', deleteSearchItemAction);
router.post('/waitlist/get', getWaitlistAction);
router.post('/waitlist/upd', updWaitListAction);


//cron-Jobs starten
(checkerCronJob) && checkerCronJob.start();
(fullCheckerCronJob) && fullCheckerCronJob.start();
(queryCronJob) && queryCronJob.start();

if (logger.isLevelEnabled('debug')) {
  try {
    (queryCronJob) && logger.debug(`Cron: Next queryCronJob: ${queryCronJob.nextDate().toISO()}`);
    (checkerCronJob) && logger.debug(`Cron: Next checkerCronJob: ${checkerCronJob.nextDate().toISO()}`);
    (fullCheckerCronJob) && logger.debug(`Cron: Next fullCheckerCronJob: ${fullCheckerCronJob.nextDate().toISO()}`);
  } catch (error) {
    logger.error(error)
  }
}

export default router;