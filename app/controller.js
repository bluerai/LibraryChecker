import { CronTime, validateCronExpression } from 'cron';
import { join } from 'path';
import { pushover } from '../utils/pushover.js';
import { cronJobs, writeToCronTab, getAutoStart } from '../utils/cron.js';

import {
  getItem, findItemId, findItem, findEBooksToCheck, findItemsToClear, findSiblings, changeItem,
  moveToList, upsertItem, updateItemById, deleteItem, findItems, upsertItems, findSearchItems,
  deleteSearchItem, upsertSearchItem
} from './model.js';

import {
  checkCassis, checkOnleihe, checkDone, checkReserved, searchCassis, queryOnleihe,
  processImportedData, getToday
} from '../utils/searchForBooks.js';

import { log } from '../utils/log.js';

/* status:
* jetzt ausleihbar
= ausgeliehen, vormerkbar
+ ausgeliehen, nicht vormerkbar -> wieder checken, unabhängig vom Datum
! Buch nicht gefunden
> Buch in donelist gefunden
x erledigt 
# vorgemerkt
- zurückgesetzt in die watchlist
*/

const cassisRemoteAdr = process.env.CASSIS_REMOTE_ADR;

const displayListTypes = {
  'watchlist': 'Merkliste',
  'reservations': 'Vormerkungen',
  'donelist': 'Erledigte Einträge',
};

const displayKennungen = {
  'DÜS': 'DÜS',
  'HESS': 'HESS',
  'GOET': 'GOET',
  'THÜR': 'THÜR',
  'all': 'komplett',
  'Erledigt': 'n/a'
};

const mediaTypes = {
  "eBook": "400001",
  "eMagazine": "400005",
  "Hörbuch": "400002",
  "ePaper": "400006",
  "eLearning": "400013"
}

export const httpRoot = {
  'DÜS': 'https://duesseldorf.onleihe.de',
  'HESS': 'https://hessen.onleihe.de',
  'GOET': 'https://goethe-institut.onleihe.de',
  'THÜR': 'https://www.onleihe.de/thuebibnet/frontend/'
};

function renderResultslistEntry(res, item, targetId, options) {
  res.render(join(import.meta.dirname, 'views', 'listEntry'), { item, targetId }, function (err, html) {
    if (err) {
      log.error(err);
      res.status(500).json({ error: 'renderResultslistEntry: ' + err.message });
    } else {
      res.status(200).json({ html, options });
    }
  });
}

export async function homeAction(req, res) {
  try {
    log.info(`homeAction`);
    res.render('start', {
      mediaTypes,
      selectedList: null,
      selectedKennung: null
    });
  } catch (err) {
    errorHandler(err, 'homeAction', res);
  }
}

export async function listAction(req, res) {
  try {
    log.debug(`listAction: path=${req.path}, query=${JSON.stringify(req.query)}`);

    const { listType, kennung, sort, dir } = req.query;
    const sortOrder = dir === 'asc' ? 1 : -1;
    const items = await findItems(listType, kennung, { [sort]: sortOrder, "searchString": 1 });

    const data = {
      selectedList: items,
      selectedKennung: kennung,
      listTitle: `${displayListTypes[listType]}, ${displayKennungen[kennung]}`,
      sortField: sort,
      sortDirection: dir,
      listType,
      err: null
    };

    res.render('itemlist', data, (err, html) => {
      if (err) {
        errorHandler(err, 'listAction: render itemlist', res);
      } else {
        res.status(200).json({ html });
      }
    });

  } catch (err) {
    errorHandler(err, 'listAction', res);
  }
}

export async function processJson(kennung, items) {
  log.debug(`parseJson: ${kennung}: ${items.length} items found`);

  if (!kennung) { return null; }

  const results = [];

  const importType = "watchlist";

  for (const item of items) {
    const mediaType = item.typ;
    const mediaId = item.mediaId;
    const received = undefined;
    const author = item.autor?.replaceAll(/[\n ]+/g, " ")?.replaceAll(",", "; ")?.replaceAll("  ", " ");  //ggf. mehrere Autoren!
    const title = item.titel.replaceAll(/[\n ]+/g, " ");

    let searchString = `${(author) ? author + "; " : ""}${title}`;

    log.debug("processJson:", searchString);

    let available = (item.datum) ?
      item.datum.substring(6, 10) + "-" + item.datum.substring(3, 5) + "-" + item.datum.substring(0, 2) :
      undefined;
    let status = (available) ? "=" : "*"
    let listType = importType;


    if (await checkCassis({ searchString })) {
      //log.debug(`parseHtml: ^ ${available} Cassis: ${searchString}`)
      status = "^";
      listType = 'donelist';

    } else {
      const item0 = await checkReserved(kennung, searchString);
      if (item0) {
        searchString = item0.searchString
        available = item0.datum; //Datum bleibt!
        log.debug(`processJson: # already in reservations: ${searchString} - ${available}`);
        status = "#";
        listType = 'reservations';
      } else {
        const item0 = await checkDone(searchString);
        if (item0) {
          log.debug(`processJson: x ${available} erledigt: ${item0.searchString}`)
          searchString = item0.searchString
          status = ">";
          listType = 'donelist';
        }
      }
    }


    if (listType) {

      const mediaData = {
        available,
        author: author,
        title,
        received,
        kennung
      }

      const result = {
        mediaId,
        datum: available,
        status,
        kennung,
        searchString,
        mediaType,
        mediaData,
        listType,
        received
      };

      // nur sichern, wenn nicht in Cassis
      if (result.status !== "^")
        results.push(result);
      else
        log.debug("Gefunden in Cassis: ", result.searchString);
    }
  }

  return results;

}


export async function importData(kennung, limit) {
  log.debug(`importData: Bibliothek=${kennung}, Limit: ${limit}`);

  const queryData = await queryOnleihe(kennung, limit);
  if (queryData.error) return queryData;

  log.debug(`importData: ${kennung}: Found ${queryData.length} item(s)`);
  //log.debug('importData', queryData);

  const { results, availableCount } = await processImportedData(kennung, queryData);

  log.debug("importData: availableCount=", availableCount);

  let message;
  let newCount = 0;
  if (results && results.length > 0) {
    const { resultCounts, datumChangedCount } = await upsertItems(results);
    newCount = resultCounts?.upsertedCount;
    message = `${kennung}: ${queryData.length} Bücher, ${(newCount !== 0) ? ('neu im Bestand: ' + newCount) : ''}, verfügbar: ${availableCount}, aktualisiert: ${resultCounts?.modifiedCount}, neues Datum: ${datumChangedCount}`
  } else {
    message = `${kennung}: ${queryData.length} Bücher, verfügbar: 0, aktualisiert: 0, neues Datum: 0`
  }

  return ({ available: availableCount, new: newCount, success: message });
}

export async function importAction(req, res) {
  try {
    log.info('importAction:', req.body);
    const { kennung, limit } = req.body;

    const result = await importData(kennung, limit);

    log.debug(`importAction: ${kennung}: ${(result.success) ? result.success : result.error}`);

    res.status(200).json(result);

  } catch (err) {
    errorHandler(err, 'importAction', res);
  }
};


async function singleSearch(item) {
  log.debug(`singleSearch: item`, item.searchString);

  let result = await checkCassis(item);  //{ datum: getToday(), status: "^", listType: 'donelist' }
  if (result) {
    item.datum = result.datum;
    item.status = result.status;
    item.listType = result.listType;
    log.debug(`singleSearch: ^ ${result.datum} Cassis: ${item.searchString}`)

  } else {
    result = await checkDone(item.searchString);
    if (result) {
      item.datum = result.datum;
      item.status = result.status;
      item.listType = result.listType;
      item.mediaId = result.mediaId;
      log.debug(`singleSearch: > ${result.datum} erledigt: ${item.searchString}`)

    } else {

      const results = await checkOnleihe(item, 1);

      if (results.length == 0) return null;

      result = results[0];

      item.datum = result.datum;
      item.status = result.status;
      item.kennung = result.kennung;
      item.searchString = result.searchString;
      item.received = result.received;
      item.mediaType = result.mediaType;
      item.mediaData = result.mediaData;

      if (result.mediaId && result.mediaId.length > 12) item.mediaId = result.mediaId;
    }
  }
  return item;
}


export async function updateItemAction(req, res) {
  try {
    const { item: item0, targetId, upsert } = req.body;
    log.info(`updateItemAction: item0=`, item0.kennung, item0.searchString, ", targetId=", targetId);

    const oldDatum = item0.datum || undefined;
    let searchResult = await singleSearch(item0);
    if (!searchResult) {
      return res.status(404).json({ message: 'updateItemAction: No item found' });
    }
    const item = await updateItemById(searchResult, upsert);
    if (!item) {
      return res.status(404).json({ message: 'updateItemAction: item not saved' });
    }



    let message;

    if (item.status === "*") {
      message = `${item.mediaType} jetzt ausleihbar!`
    } else if (oldDatum !== item.datum) {
      message = `${item.mediaType} verfügbar ab ${item.datum}`;
    }

    const options = { item, message }

    renderResultslistEntry(res, item, targetId, options)

  } catch (err) {
    errorHandler(err, 'updateItemAction', res);
  }
}


export async function importItemAction(req, res) {
  try {
    const { item: item0, targetId, upsert } = req.body;
    log.info(`updateItemAction: item0=`, item0.kennung, item0.searchString, ", targetId=", targetId);

    const oldDatum = item0.datum || undefined;
    let searchResult = await singleSearch(item0);
    if (!searchResult) {
      return res.status(404).json({ message: 'updateItemAction: No item found' });
    }
    const item = await updateItemById(searchResult, upsert);
    if (!item) {
      return res.status(404).json({ message: 'updateItemAction: item not saved' });
    }
    log.debug('updateItemAction: ', item);
    let message;

    if (item.status === "*") {
      message = `${item.mediaType} jetzt ausleihbar!`
    } else if (oldDatum !== item.datum) {
      message = `${item.mediaType} verfügbar ab ${item.datum}`;
    }

    const options = { item, message }

    renderResultslistEntry(res, item, targetId, options)

  } catch (err) {
    errorHandler(err, 'updateItemAction', res);
  }
}

export async function markAsDoneAction(req, res) {
  try {
    const { itemId, targetId } = req.body;
    log.info(`markAsDoneAction: itemId=${itemId}, targetId = ${targetId}`);

    const item = await moveToList(itemId, 'donelist', 'x');

    const siblings = await findSiblings(item.kennung, item.searchString);
    siblings.map(item => moveToList(item._id, 'donelist', 'x'));  //async - no await

    renderResultslistEntry(res, item, targetId)

  } catch (err) {
    errorHandler(err, 'markAsDoneAction', res);
  }
};

export async function markAsReservedAction(req, res) {
  try {
    const { itemId, targetId } = req.body;
    log.info(`markAsReservedAction: itemId=${itemId}, targetId=${targetId}`);

    const item = await moveToList(itemId, 'reservations', '#');

    const siblings = await findSiblings(item.kennung, item.searchString);
    siblings.map(item => moveToList(item._id, 'donelist', 'x'));  //async - no await

    renderResultslistEntry(res, item, targetId)

  } catch (err) {
    errorHandler(err, 'markAsReservedAction', res);
  }
};

export async function changeAction(req, res) {
  try {
    const { itemId, searchString, prio, datum, targetId } = req.body;
    log.debug(`changeAction: itemId=${itemId}, searchString=${searchString}, datum=${datum}, prio=${prio}`);

    const item = await changeItem(itemId, searchString, prio, datum);

    renderResultslistEntry(res, item, targetId)

  } catch (err) {
    errorHandler(err, 'changeAction', res);
  }
};

export async function resetAction(req, res) {
  try {
    const { itemId, targetId } = req.body;
    log.info(`resetAction: itemId=${itemId}`);

    const item = await moveToList(itemId, 'watchlist', "=");

    renderResultslistEntry(res, item, targetId)

  } catch (err) {
    errorHandler(err, 'resetAction', res);
  }
};

function sortResults(a, b) {
  let x = a.mediaData.title.toLowerCase();
  let y = b.mediaData.title.toLowerCase();
  if (x < y) { return -1; }
  if (x > y) { return 1; }
  return 0;
}

async function prepareItem(item) {
  try {
    if (item.kennung !== "CASSIS") {
      const item0 = await findItem(item.kennung, item.searchString);

      if (item0) {
        item._id = item0._id;
        item.listType = item0.listType;
        if (item.listType == 'donelist') item.status = ">";
        if (item.listType == 'reservations') item.status = "#";
        item.searchString = item0.searchString;
        item.lastUpdated = item0.lastUpdated;
      }

      if (item.status !== "!") {
        const result = (await checkCassis(item));
        if (result) item.status = result.status;
      }

    }
    return item;

  } catch (error) {
    log.error('Datenbankfehler:' + JSON.stringify(error));
    throw error;
  }
}

export async function fullSearchAction(req, res) {
  try {
    const { searchString, unselectString, mediaType, kennungen } = req.body;
    log.info(`fullSearchAction: searchString=${searchString}, unselectString=${unselectString}, mediaType=${mediaType}, kennungen=${kennungen}`);

    const limit = 40; //max Anzahl von Ergebnissen pro Quelle

    let results = [];

    for (const kennung of kennungen) {
      let results0;
      if (kennung === 'CASSIS') {
        results0 = (await searchCassis(searchString));
        results0.splice(limit);
        log.debug('CASSIS', results0.length);

      } else {
        results0 = await checkOnleihe({ searchString, unselectString, mediaType, kennung }, limit);
        results0 = results0.filter((item) => (item.status !== "!"));
        log.debug(kennung, results0.length);

      }
      results = results.concat(results0);
    }

    let preparedResults = (await Promise.all(results = results.map(prepareItem)))
      .filter(item => (unselectString == "") || !item.searchString.toLocaleLowerCase().includes(unselectString))
      .sort(sortResults);

    log.silly("preparedResults:", preparedResults)

    res.render(join(import.meta.dirname, 'views', 'resultlist'), { results: preparedResults }, function (err, html) {
      if (err) {
        log.error(err);
        res.status(500).json({ error: 'render resultlist: ' + err.message });
      } else {
        res.status(200).json({ html: html });
      }
    });
  } catch (err) {
    errorHandler(err, 'fullSearchAction', res);
  }
}

export async function deleteAction(req, res) {
  try {
    const { itemId, targetId } = req.body;
    log.info(`deleteAction: itemId=${itemId}`);

    const item = await getItem(itemId);

    item.status = (item.datum === getToday()) ? "*" : "=";
    delete (item.listType);
    delete (item.lastUpdated);
    delete (item._id);

    await deleteItem(itemId);

    renderResultslistEntry(res, item, targetId)

  } catch (err) {
    errorHandler(err, 'deleteAction', res);
  }
};

//*********************** Menu actions ***********************************/

export async function bulkUpdate(items, minWait) {   //minWait in sec zwischen den Überprüfungen, maxWait = 5 * minWait
  log.debug(`bulkUpdate: items.length=${items.length}, wait=${minWait}`);
  let availCount = 0;
  let availDateCount = 0;

  for (const item of items) {
    try {
      const datum = item.datum;
      let result = await singleSearch(item);

      if (!result) result = item; //HACK: Fehler in Onleihe-Suche. By Suche mit mediaId kommt das nicht vor! 

      result = await updateItemById(result);

      if (result.status === "*") availCount++;
      if (result.datum !== datum) availDateCount++;

      if (item !== items[items.length - 1]) {
        // Warte (außer beim letzten Item)
        const delay = minWait * 1000 + Math.random() * 4000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }

    } catch (err) {
      const message = `bulkUpdate: Fehler bei: "${item?.kennung}" "${item?.searchString}" "${item?.mediaId}" :`
      log.error(message, err);
      log.error(item);
      pushover.syswarn(message, "Library Checker");
      //return { error: message };
      //weiter mit nächstem Item
    }
  }

  const message = `${items.length} Bücher aktualisiert, verfügbar: ${availCount}, neues Datum: ${availDateCount}, `;

  log.debug(message);
  return { success: message };
}

export const bulkUpdateAction = async (req, res) => {
  try {

    log.info('bulkUpdateAction: days=', req.body.days);

    const days = parseInt(req.body.days, 10);

    const items = await findEBooksToCheck(days);
    log.debug('bulkUpdateAction:', items.length, ' items gefunden')

    const result = await bulkUpdate(items, 8);

    res.status((result.success) ? 200 : 500).json(result);

  } catch (err) {
    errorHandler(err, 'bulkUpdateAction', res);
  }
};



export async function jsonFileAction(req, res) {
  try {
    if (!req.file) return res.status(400).send('jsonFileAction: No file uploaded')

    const { kennung } = req.body;
    const { buffer, originalname } = req.file;

    log.debug(`jsonFileAction: kennung=${kennung}, file=${originalname}`);

    let items = [];
    let itemsCount = 0;

    if (originalname.endsWith('.json')) {
      const stringArr = buffer.toString('utf-8').split('\n');
      for (const str of stringArr) {
        if (str && str.length > 0) {
          const item = JSON.parse(str);
          items.push(item);
        }
      }
      itemsCount = items.length;
      items = await processJson(kennung, items);
    }

    if (items && items.length > 0) {
      const result = await upsertItems(items);

      if (result.success) {
        const msg = (result.resultCounts) ?
          `[${kennung}] Hochgeladene Datensätze: ${itemsCount}, davon neu: ${result.resultCounts?.insertedCount}, aktualisiert: ${result.resultCounts?.updatedCount}` :
          `${result.message}`
        log.debug(msg)
        res.status(200).json({ success: msg });

      } else {
        log.error('Fehler:', result.error);
        res.status(500).json({ error: result.error }) //500 = internal server error
      }
    }

  } catch (err) {
    errorHandler(err, 'jsonFileAction', res);
  }
}

export const clearAction = async (req, res) => {
  try {
    log.info(`clearAction`);
    const items = await findItemsToClear(12);  //12 Monate zurück überprüfen

    let checkedCount = 0;
    let doneCount = 0;
    let deleteCount = 0;
    let errorCount = 0;

    for (const item of items) {
      try {
        ++checkedCount;

        if (await checkCassis(item) ||
          (item.listType === 'donelist') && (item.mediaType === "eMagazine" || item.mediaType === "ePaper")) {
          log.debug(`clearAction: [${checkedCount}] ${item.datum} Gelöscht: ${item.searchString} [${item.kennung}]`)
          deleteItem(item._id)
          deleteCount++;

        } else {
          if (item.listType === 'watchlist' && await checkDone(item.searchString)) {
            log.debug(`clearAction: [${checkedCount}] ${item.datum} ${item.kennung}: Erledigt: ${item.searchString}`)
            moveToList(item._id, 'donelist', 'x');
            doneCount++;

          } else {
            if (typeof item.lastUpdated === 'string' || item.lastUpdated instanceof String) {
              updateItemById(item)
            }
          }
        }

      } catch (err) {
        log.error(`clearAction: Fehler bei Item ${checkedCount}: "${item.kennung}" "${item.searchString}":`, err);
        errorCount++;
      }
    }
    let message = `Einträge, geprüft: ${checkedCount}, erledigt: ${doneCount}, gelöscht: ${deleteCount}.`;
    if (errorCount > 0) message += `. Fehler: ${errorCount}`
    log.debug(message);
    pushover.sysnote(message, 'Library Checker');

    res.json({ counts: { checkedCount, doneCount, deleteCount, errorCount }, message });

  } catch (err) {
    errorHandler(err, 'clearAction', res);
  }
};

export async function itemAction(req, res) {
  try {
    const { item, targetId, listpath } = req.body;
    log.debug(`itemAction: item=`, item);

    if (!item._id) {
      const id = await findItemId(item.kennung, item.searchString);
      if (id) {
        item._id = id;
      }
    }

    let cassisUrl = cassisRemoteAdr + encodeURIComponent(item.searchString);

    let onlUrl;
    if (['HESS', 'DÜS', 'GOET'].includes(item.kennung)) {
      if (item.mediaId)
        onlUrl = `${httpRoot[item.kennung]}/search/mediadetail?productId=${item.mediaId}`
    } else {
      onlUrl = `${httpRoot[item.kennung]}${item.mediaData.mediaRef}`
    }

    const data = {
      targetId,
      listpath,
      displayListType: displayListTypes[item.listType],
      cassisUrl,
      onlUrl
    }

    res.render(join(import.meta.dirname, 'views', 'item'), { item, data }, function (err, html) {
      if (err) {
        log.error(err);
        res.status(500).json({ error: 'render item: ' + err.message });
      } else {
        //log.debug(html);
        res.send({ html });
      }
    });

  } catch (err) {
    errorHandler(err, 'itemAction', res);
  }
}

export async function cronJobsAction(req, res) {
  try {
    const sortedJobs = new Map(
      [...cronJobs.entries()].sort((a, b) => a[1].nextDate() - b[1].nextDate()).sort((a, b) => b[1].isActive - a[1].isActive)
    )

    let html = `<div class="table-responsive"><table class="table table-hover"><thead><tr><th>Job</th><th>Nächste Ausführung</th><th>Zeitmuster</th></tr></thead><tbody>`
    sortedJobs.forEach((job, name) => {
      html += `<tr onClick="openCronModal('${name}','${job.cronTime}', ${getAutoStart(name)})"><td>${job.context}</td>`

      if (job.isActive)
        html += `<td class='text-primary'>${job.nextDate().toISO().split('.')[0].replace('T', ', ')}</td>`
      else
        html += `<td>pausiert</td>`

      html += `<td>${job.cronTime}</td><td>`;

      if (getAutoStart(name) === true)
        html += `<i class="bi bi-send" style="font-size: 18px"></i>`;

      html += `</td></tr>`
    })

    html += `</tbody></table></div>`

    res.json({ html });

  } catch (err) {
    errorHandler(err, 'cronAction', res);
  }
}

export async function cronAction(req, res) {
  try {
    log("cronAction:", req.params, req.body);
    const { jobName, cronTimeString, autoStart } = req.body;
    const action = req.params.action;
    const job = cronJobs.get(jobName);

    let result;

    switch (action) {
      case 'start': {
        job.start();
        result = { "success": `Job "${job.context}" gestartet.` };
        break
      }
      case 'pause': {
        job.stop();
        result = { "success": `Job "${job.context}" pausiert.` };
        break
      }
      case 'save': {
        const checkCronTime = validateCronExpression(cronTimeString);

        if (checkCronTime?.valid) {
          job.setTime(new CronTime(cronTimeString));
          writeToCronTab(jobName, cronTimeString, autoStart)
          result = { "success": `Job "${job.context}" wurde gespeichert.` };

        } else {
          result = { "error": `Der Ausdruck "${cronTimeString}" ist kein gültiges Cron- Zeitmuster: ${checkCronTime.error.message} ` };

        }
        break
      }
      default: {
        result = { "error": `Aktion "${action}" ist nicht definiert.` };
      }
    }

    res.json(result);

  } catch (err) {
    errorHandler(err, 'cronAction', res);
  }
};

//**************** waitist & searchItems */

export async function upsertSearchItemAction(req, res) {
  try {
    const { searchString, unselectString, mediaType, kennungen, targetDate } = req.body;
    log.info(`upsertSearchItemAction: searchString = ${searchString}, mediaType = ${mediaType}, kennungen = ${kennungen}, targetDate = ${targetDate} `);

    let item = { searchString, unselectString, mediaType, kennungen, targetDate, available: [] };

    await upsertSearchItem(item);

    const items = await findSearchItems({}, { 'targetDate': 1 });

    const data = {
      items,
      listTitle: `Warteliste`,
      sortField: 'targetDate',
      sortDirection: 'asc',
      today: getToday()
    };

    res.render(join(import.meta.dirname, 'views', 'waitlist'), data, function (err, html) {
      if (err) {
        errorHandler(err, 'render upsertSearchItemAction', res);
      } else {
        res.status(200).json({ html });
      }
    })

  } catch (err) {
    errorHandler(err, 'upsertSearchItemAction', res);
  }
}

export async function getWaitlistAction(req, res) {
  try {
    log.info(`getWaitlistAction: path = `, req.path, `body = `, req.body);

    const { field, direction } = req.body;
    const items = await findSearchItems({}, { 'status': -1, 'targetDate': 1 });

    const data = {
      items,
      listTitle: `Warteliste`,
      sortField: field,
      sortDirection: direction,
      today: getToday()
    };

    res.render('waitlist', data, (err, html) => {
      if (err) {
        errorHandler(err, 'getWaitlistAction: render waitlist', res);
      } else {
        res.status(200).json({ html });
      }
    });

  } catch (err) {
    errorHandler(err, 'listAction', res);
  }
}

export async function updWaitListAction(req, res) {
  try {
    log.info(`updWaitListAction`);

    const searchItems = await findSearchItems({ 'targetDate': getToday() });

    log.debug('updWaitListAction', searchItems);

    await updateSearchItems(searchItems)

    const items = await findSearchItems({}, { 'status': -1, 'targetDate': 1 });

    const data = {
      items,
      listTitle: `Warteliste`,
      sortField: 'targetDate',
      sortDirection: 'asc',
      today: getToday()
    };

    res.render('waitlist', data, (err, html) => {
      if (err) {
        errorHandler(err, 'updWaitListAction: render waitlist', res);
      } else {
        res.status(200).json({ html });
      }
    });

  } catch (err) {
    errorHandler(err, 'updWaitListAction', res);
  }
}

export async function updateSearchItems(items) {

  const limit = 40; //max Anzahl von Ergebnissen pro Quelle

  for (const item of items) {

    for (const kennung of item.kennungen) {
      if ((item.available.indexOf(kennung) === -1)) {

        const results = await checkOnleihe({ kennung, searchString: item.searchString, unselectString: item.unselectString, mediaType: item.mediaType }, limit);

        for (const result of results) {
          if (result.status !== "!") {

            result.listType = 'watchlist';
            result.prio = true;
            upsertItem(result);

            item.available.push(kennung);
            pushover.sysnote(`"${item.searchString}" ist jetzt verfügbar!`, `Library Checker ${kennung} `);

            item.status = "=";

          }
        }

      }
    }

    upsertSearchItem(item);
  }

}

export async function deleteSearchItemAction(req, res) {
  try {
    const { itemId } = req.body;
    log.debug(`deleteSearchItemAction: itemId = ${itemId} `);

    // Datenbankzugriff
    const result = deleteSearchItem(itemId);

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'deleteSearchItemAction: Eintrag nicht gefunden' });
    }

    res.sendStatus(200);

  } catch (err) {
    errorHandler(err, 'deleteSearchItemAction', res);
  }
};

const errorHandler = (err, actionName, res) => {
  const message = "CheckLib: Fehler in '" + actionName + "': " + err.message;
  log.error(message);
  if (err.stack) log.debug(err.stack);
  if (res) {
    res.status(500).json({ error: 'Fehler: ' + err.message });
  }
};
