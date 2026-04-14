import express from 'express';

import {
  homeAction, listAction, jsonFileAction, importAction, updateItemAction,
  bulkUpdateAction as bulkUpdateAction, markAsDoneAction, markAsReservedAction, resetAction, clearAction,
  deleteAction, itemAction, fullSearchAction, changeAction, upsertSearchItemAction, getWaitlistAction,
  deleteSearchItemAction, updWaitListAction, cronAction, cronJobsAction
} from './controller.js';
import upload from '../utils/uploadConfig.js';


const router = express.Router();
export default router;

router.get('/', homeAction);
router.get('/list', listAction);
router.post('/import', importAction);
router.post('/menu', itemAction);
router.post('/update', bulkUpdateAction);
router.post('/updItem', updateItemAction);  //importItem, updateItem
router.post('/upl/json', upload.single('jsonlistFile'), jsonFileAction);
router.post('/done', markAsDoneAction);
router.post('/change', changeAction);
router.post('/reserved', markAsReservedAction);
router.post('/reset', resetAction);
router.post('/clear', clearAction);
router.post('/del', deleteAction);
router.post('/search', fullSearchAction);
router.post('/cron/jobs', cronJobsAction);
router.post('/cron/:action', cronAction);

router.post('/waitlist/upsert', upsertSearchItemAction);
router.post('/waitlist/del', deleteSearchItemAction);
router.post('/waitlist/get', getWaitlistAction);
router.post('/waitlist/upd', updWaitListAction);

