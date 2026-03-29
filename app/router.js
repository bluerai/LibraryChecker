import express from 'express';

import { checkerCronJob, fullCheckerCronJob, queryCronJob } from '../utils/cron.js';
import { log } from '../utils/log.js';

import {
  homeAction, listAction, jsonFileAction, importAction as importAction, updateItemAction as updateItemAction,
  bulkUpdateAction as bulkUpdateAction, markAsDoneAction, markAsReservedAction, resetAction, clearAction,
  deleteAction, itemAction, fullSearchAction, changeAction, upsertSearchItemAction, getWaitlistAction,
  deleteSearchItemAction, updWaitListAction
} from './controller.js';
import upload from '../utils/uploadConfig.js';


const router = express.Router();

router.get('/', homeAction);
router.get('/list', listAction);
router.post('/import', importAction);
router.post('/menu', itemAction);
router.post('/update', bulkUpdateAction);
router.post('/updItem', updateItemAction);
router.post('/upl/json', upload.single('jsonlistFile'), jsonFileAction);
router.post('/done', markAsDoneAction);
router.post('/change', changeAction);
router.post('/reserved', markAsReservedAction);
router.post('/reset', resetAction);
router.post('/clear', clearAction);
router.post('/del', deleteAction);
router.post('/search', fullSearchAction);

router.post('/waitlist/upsert', upsertSearchItemAction);
router.post('/waitlist/del', deleteSearchItemAction);
router.post('/waitlist/get', getWaitlistAction);
router.post('/waitlist/upd', updWaitListAction);


//cron-Jobs starten
(checkerCronJob) && checkerCronJob.start();
(fullCheckerCronJob) && fullCheckerCronJob.start();
(queryCronJob) && queryCronJob.start();

if (log.isLevelEnabled('debug')) {
  try {
    (queryCronJob) && log.debug(`Cron: Next queryCronJob: ${queryCronJob.nextDate().toISO()}`);
    (checkerCronJob) && log.debug(`Cron: Next checkerCronJob: ${checkerCronJob.nextDate().toISO()}`);
    (fullCheckerCronJob) && log.debug(`Cron: Next fullCheckerCronJob: ${fullCheckerCronJob.nextDate().toISO()}`);
  } catch (error) {
    log.error(error)
  }
}

export default router;