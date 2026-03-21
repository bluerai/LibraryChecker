import { join } from 'path';
import { push } from '../utils/pushover.js';

import {
  getItem, findItemId, findItem, findItemsToCheck, findItemsToClear, findSiblings, changeItem,
  moveToList, upsertItem, upsertItemById, deleteItem, findItems, upsertItems,
  findSearchItems, deleteSearchItem, upsertSearchItem, convert
} from './model.js';
import { checkCassis, checkOnleihe, checkDone, checkReserved, searchCassis, getToday } from '../utils/searchForBooks.js';
import { logger } from '../utils/log.js';

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

const cassisHost = process.env.CASSIS_HOST;

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
  'GOET': 'https://www.onleihe.de/goethe-institut/frontend/',
  'THÜR': 'https://www.onleihe.de/thuebibnet/frontend/'
};

function renderResultslistEntry(res, item, targetId, options) {
  res.render(join(import.meta.dirname, 'views', 'listEntry'), { item, targetId }, function (err, html) {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'renderResultslistEntry: ' + err.message });
    } else {
      res.status(200).json({ html, options });
    }
  });
}

export async function homeAction(req, res) {
  try {
    logger.info(`homeAction`);
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
    logger.info(`listAction: path=${req.path}, query=${JSON.stringify(req.query)}`);

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
  logger.info(`parseJson: ${kennung}: ${items.length} items found`);

  if (!kennung) { return null; }

  const results = [];

  const importType = "watchlist";

  for (const item of items) {
    const mediaType = item.typ;
    const mediaId = item.mediaId;
    const received = undefined;
    const author = item.autor.replaceAll(/[\n ]+/g, " ");  //ggf. mehrere Autoren!
    const title = item.titel.replaceAll(/[\n ]+/g, " ");

    let searchString = `${(author) ? author + "; " : ""}${title}`;

    console.log("processJson:", searchString);

    let available = (item.datum) ?
      item.datum.substring(6, 10) + "-" + item.datum.substring(3, 5) + "-" + item.datum.substring(0, 2) :
      undefined;
    let status = (available) ? "=" : "*"
    let listType = importType;


    if (await checkCassis({ searchString })) {
      //logger.debug(`parseHtml: ^ ${available} Cassis: ${searchString}`)
      status = "^";
      listType = 'donelist';

    } else {
      const item0 = await checkReserved(kennung, searchString);
      if (item0) {
        searchString = item0.searchString
        available = item0.datum; //Datum bleibt!
        logger.debug(`processJson: # already in reservations: ${searchString} - ${available}`);
        status = "#";
        listType = 'reservations';
      } else {
        const item0 = await checkDone(searchString);
        if (item0) {
          logger.debug(`processJson: x ${available} erledigt: ${item0.searchString}`)
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
        kennung,
        mediaId
      }

      const result = {
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
        console.log("Gefunden in Cassis: ", result.searchString);
    }
  }

  return results;

}

export async function importJson(kennung, json) {

  logger.debug(`JSON-Import gestartet: Kennung=${kennung}, Anzahl: ${json.count}`);

  let insertedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  let availableCount = 0;

  const items = await processJson(kennung, json);

  if (items && items.length > 0) {
    const result = await upsertItems(items);
    insertedCount += result.insertedCount;
    updatedCount += result.updatedCount;
    errorCount += result.errorCount;
    availableCount += result.availableCount;
  }

  const message = `Bücher, neu: ${insertedCount}, aktualisiert: ${updatedCount}, verfügbar: ${availableCount}`;

  return ({ available: availableCount, message });
}

export async function importJsonAction(req, res) {
  try {

    const { kennung, jsonString } = req.body

    //TODO Input validieren!

    console.log(kennung);
    console.log(jsonString);
    let json;
    try {
      json = JSON.parse(jsonString)
    } catch (err) {
      errorHandler(err, 'importJsonDataAction', res);
    }

    const result = await importJson(kennung, json);


    console.log(`Found: ${json.length} item(s)`);

    logger.info(`importJsonDataAction: ${result.message}`);

    res.status(200).json(result);

  } catch (err) {
    errorHandler(err, 'importJsonDataAction', res);
  }
};

async function singleSearch(item) {
  console.log(`singleSearch: item`, item);

  let result = await checkCassis(item);  //{ datum: getToday(), status: "^", listType: 'donelist' }
  if (result) {
    item.datum = result.datum;
    item.status = result.status;
    item.listType = result.listType;
    logger.debug(`singleSearch: ^ ${result.datum} Cassis: ${item.searchString}`)

  } else {
    result = await checkDone(item.searchString);
    if (result) {
      item.datum = result.datum;
      item.status = result.status;
      item.listType = result.listType;
      item.mediaId = result.mediaId;
      logger.debug(`singleSearch: > ${result.datum} erledigt: ${item.searchString}`)
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
    }
  }
  return item;
}


export async function upsertAction(req, res) {
  try {
    const { item: item0, targetId } = req.body;
    console.log(`upsertAction: item0=`, item0, ", targetId=", targetId);

    const oldDatum = item0.datum || undefined;
    let searchResult = await singleSearch(item0);

    console.log("upsertAction", searchResult);

    if (!searchResult) {
      return res.status(404).json({ message: 'upsertAction: No item found' });
    }

    const item = await upsertItemById(searchResult);
    if (!item) {
      return res.status(404).json({ message: 'upsertAction: item not saved' });
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
    errorHandler(err, 'upsertAction', res);
  }
}

export async function markAsDoneAction(req, res) {
  try {
    const { itemId, targetId } = req.body;
    logger.info(`markAsDoneAction: itemId=${itemId}, targetId = ${targetId}`);

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
    logger.info(`markAsReservedAction: itemId=${itemId}, targetId=${targetId}`);

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
    logger.debug(`changeAction: itemId=${itemId}, searchString=${searchString}, datum=${datum}, prio=${prio}`);

    const item = await changeItem(itemId, searchString, prio, datum);

    renderResultslistEntry(res, item, targetId)

  } catch (err) {
    errorHandler(err, 'changeAction', res);
  }
};

export async function resetAction(req, res) {
  try {
    const { itemId, targetId } = req.body;
    logger.info(`resetAction: itemId=${itemId}`);

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
    logger.error('Datenbankfehler:' + JSON.stringify(error));
    throw error;
  }
}

export async function fullSearchAction(req, res) {
  try {
    const { searchString, mediaType, kennungen } = req.body;
    logger.info(`fullSearchAction: searchString=${searchString}, mediaType=${mediaType}, kennungen=${kennungen}`);

    const limit = 50; //max Anzahl von Ergebnissen pro Quelle

    let results = [];

    for (const kennung of kennungen) {
      let results0;

      if (kennung === 'CASSIS') {
        results0 = (await searchCassis(searchString));
        results0.splice(limit);

      } else {
        results0 = await checkOnleihe({ kennung, searchString, mediaType }, limit);
        results0 = results0.filter((item) => (item.status !== "!"));
      }

      results = results.concat(results0);
    }

    let preparedResults = (await Promise.all(results = results.map(prepareItem))).sort(sortResults);

    //console.log(preparedResults);

    res.render(join(import.meta.dirname, 'views', 'resultlist'), { results: preparedResults }, function (err, html) {
      if (err) {
        console.error(err);
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
    logger.info(`deleteAction: itemId=${itemId}`);

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

export async function bulkUpdate(items, wait) {  // wait in sec
  logger.info(`bulkUpdate: items.length=${items.length}, wait=${wait}`);
  let checkedCount = 0;
  let successCount = 0;
  let availCount = 0;

  for (const item of items) {
    try {
      ++checkedCount;

      let result = await singleSearch(item);
      // Ergebnis speichern
      result = await upsertItemById(result);

      if (result.status === "*") availCount++;

      successCount++;

      if (item !== items[items.length - 1]) {
        // Warte (außer beim letzten Item)
        await new Promise(resolve => setTimeout(resolve, Math.floor(wait + Math.random(wait) * 1000)));
      }


    } catch (err) {
      logger.error(`bulkUpdate: Fehler bei Item ${checkedCount}: "${item.kennung}" "${item.searchString}":`, err);
    }
  }
  const message = `bulkUpdate: Prüfung abgeschlossen: ${successCount} von ${checkedCount} Einträgen erfolgreich geprüft`;
  if (successCount === checkedCount) {
    logger.info(message);
  } else {
    logger.warn(message);
    push.syswarn(message, "Library Checker");
  }
  return { checkedCount, successCount, availCount };
}

export const updateAction = async (req, res) => {
  try {
    const { days } = req.body;
    logger.info(`updateAction: days=${days}`);

    const items = await findItemsToCheck(days);

    console.log('updateAction:', items.length, ' items gefunden')

    const { checkedCount, successCount, availCount } = await bulkUpdate(items, 15);

    res.status(200).json({ checkedCount, successCount, availCount });

  } catch (err) {
    errorHandler(err, 'updateAction', res);
  }
};



export async function jsonFileAction(req, res) {
  try {
    if (!req.file) {
      return res.status(400).send('jsonFileAction: No file uploaded');
    }

    const { kennung } = req.body;
    const { buffer, originalname } = req.file;

    logger.info(`jsonFileAction: kennung=${kennung}, file=${originalname}`);

    let items = [];

    if (originalname.endsWith('.json')) {
      const stringArr = buffer.toString('utf-8').split('\n');
      for (const str of stringArr) {
        if (str && str.length > 0) {
          const item = JSON.parse(str);

          items.push(item);
        }
      }
      items = await processJson(kennung, items);
    }

    if (items && items.length > 0) {
      const result = await upsertItems(items);

      if (result.success) {
        logger.info(`jsonFileAction: kennung=${kennung}: neue Einträge: ${result.insertedCount}, aktualisierte Einträge: ${result.updatedCount}`);
        res.status(200).json({ success: `${kennung}: neue Einträge: ${result.insertedCount}, aktualisierte Einträge: ${result.updatedCount}` });

      } else {
        logger.error('Fehler:', result.error);
        res.status(500).json({ error: result.error }) //500 = internal server error
      }
    }

  } catch (err) {
    errorHandler(err, 'jsonFileAction', res);
  }
}

export const clearAction = async (req, res) => {
  try {
    logger.info(`clearAction`);
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
          logger.debug(`clearAction: [${checkedCount}] ${item.datum} Gelöscht: ${item.searchString} [${item.kennung}]`)
          deleteItem(item._id)
          deleteCount++;

        } else {
          if (item.listType === 'watchlist' && await checkDone(item.searchString)) {
            logger.debug(`clearAction: [${checkedCount}] ${item.datum} ${item.kennung}: Erledigt: ${item.searchString}`)
            moveToList(item._id, 'donelist', 'x');
            doneCount++;

          } else {
            if (typeof item.lastUpdated === 'string' || item.lastUpdated instanceof String) {
              upsertItemById(item)
            }
          }
        }

      } catch (err) {
        logger.error(`clearAction: Fehler bei Item ${checkedCount}: "${item.kennung}" "${item.searchString}":`, err);
        errorCount++;
      }
    }
    let message = `Einträge, geprüft: ${checkedCount}, erledigt: ${doneCount}, gelöscht: ${deleteCount}.`;
    if (errorCount > 0) message += `. Fehler: ${errorCount}`
    logger.info(message);
    push.sysnote(message, 'Library Checker');

    res.json({ counts: { checkedCount, doneCount, deleteCount, errorCount }, message });

  } catch (err) {
    errorHandler(err, 'clearAction', res);
  }
};

export async function itemAction(req, res) {
  try {
    const { item, targetId, listpath } = req.body;
    //logger.debug(`itemAction: item=${JSON.stringify(item)}, targetId=${targetId}`);

    if (!item._id) {
      const id = await findItemId(item.kennung, item.searchString);
      if (id) {
        item._id = id;
      }
    }

    let cassisUrl = `http://${cassisHost}/app/search/${encodeURIComponent(item.searchString)}`;

    let onlUrl;
    if (['HESS', 'DÜS'].includes(item.kennung)) {
      if (item.mediaData?.mediaId && (item.mediaData.mediaId.length > 12))
        onlUrl = `${httpRoot[item.kennung]}/search/mediadetail?productId=${item.mediaData.mediaId}`
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
        console.error(err);
        res.status(500).json({ error: 'render item: ' + err.message });
      } else {
        //logger.debug(html);
        res.send({ html });
      }
    });

  } catch (err) {
    errorHandler(err, 'itemAction', res);
  }
}


//**************** waitist & searchItems */

export async function upsertSearchItemAction(req, res) {
  try {
    const { searchString, mediaType, kennungen, targetDate } = req.body;
    logger.info(`upsertSearchItemAction: searchString=${searchString}, mediaType=${mediaType}, kennungen=${kennungen}, targetDate=${targetDate}`);

    let item = { searchString, mediaType, kennungen, targetDate, available: [] };

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
    logger.info(`getWaitlistAction: path=${req.path}, body=${JSON.stringify(req.body)}`);

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
    logger.info(`updWaitListAction`);

    const items0 = await findSearchItems({ 'targetDate': getToday() });
    await updateSearchItems(items0)

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

  const limit = 20; //max Anzahl von Ergebnissen pro Quelle

  for (const item of items) {

    for (const kennung of item.kennungen) {
      if ((item.available.indexOf(kennung) === -1)) {

        const results = await checkOnleihe({ kennung, searchString: item.searchString, mediaType: item.mediaType }, limit);
        console.log(results);

        for (const result of results) {
          if (result.status !== "!") {

            result.listType = 'watchlist';
            result.prio = true;
            upsertItem(result);

            item.available.push(kennung);
            push.sysinfo(`"${item.searchString}" ist jetzt verfügbar!`, `Library Checker ${kennung}`);

            item.status = "=";

          }
        }

      }
    }
    upsertSearchItem(item);
    //console.log(item);
  }
}

export async function deleteSearchItemAction(req, res) {
  try {
    const { itemId } = req.body;
    logger.debug(`deleteSearchItemAction: itemId=${itemId}`);

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



export async function convertAction(req, res) {
  try {
    const { kennung } = req.body;
    logger.debug(`convertAction`);

    // Datenbankzugriff
    await convert();

    return res.status(200).json({ success: `convertAction: Daten konvertiert.` });

  } catch (err) {
    errorHandler(err, 'convertAction', res);
  }
};


const errorHandler = (err, actionName, res) => {
  const message = "CheckLib: Fehler in '" + actionName + "': " + err.message;
  logger.error(message);
  if (err.stack) logger.debug(err.stack);
  if (res) {
    res.status(500).json({ error: 'Fehler: ' + err.message });
  }
};
