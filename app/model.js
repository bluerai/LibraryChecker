import { MongoClient, ObjectId } from 'mongodb';
import { log } from '../utils/log.js';

const mongoUrl = process.env.CHECKLIBDB_URL || 'mongodb://localhost:27017';
const dbName = process.env.CHECKLIBDB_NAME || 'library_info';
const dataCollName = process.env.CHECKLIBDB_COLLNAME || 'data';
const searchItemsCollName = process.env.CHECKLIBDB_SEARCHITEMS_COLLNAME || 'searchItems';

export let DB;
let DATA_COLL;
let SEARCH_COLL;
let DBCLIENT;

export async function connect() {
  DBCLIENT = new MongoClient(mongoUrl);
  await DBCLIENT.connect();
  DB = DBCLIENT.db(dbName);

  DATA_COLL = DB.collection(dataCollName);
  await DATA_COLL.createIndex({ searchString: 1 });

  SEARCH_COLL = DB.collection(searchItemsCollName);
  await SEARCH_COLL.createIndex({ searchString: 1 });

  log(`Database connected: url=${mongoUrl}`);
}

export async function disconnect() {  //not used
  await DBCLIENT.close();
  log('Database disconnected.');
}

export async function getItem(itemId) {
  return await DATA_COLL.findOne({ _id: new ObjectId(itemId) });
}

export async function findItem(kennung, searchString) {
  return await DATA_COLL.findOne({ kennung, searchString });
}

export async function findItemId(kennung, searchString) {
  try {
    const item = await DATA_COLL.findOne({ kennung, searchString });
    return (item) ? new ObjectId(item._id) : null;
  } catch (error) {
    log.error('Datenbankfehler:' + JSON.stringify(error));
    throw error;
  }
}

export async function countItems() {
  return await DATA_COLL.countDocuments();
}

export async function findItemDone(searchString) {
  try {
    const escapedString = searchString.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const item = await DATA_COLL.findOne({
      listType: 'donelist',
      searchString: {
        $regex: `^${escapedString}( *\\[.*\\])?$`,
        $options: 'i' // Case-insensitive, falls gewünscht
      }
    });
    return item;
  } catch (error) {
    console.error(error);
    log.error('Datenbankfehler:' + JSON.stringify(error));
    throw error;
  }
}

export async function findItemReserved(kennung, searchString) {
  try {
    const escapedString = searchString.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const item = await DATA_COLL.findOne({
      listType: 'reservations',
      kennung: kennung,
      searchString: {
        $regex: `^${escapedString}( *\\[.*\\])?$`,
        $options: 'i' // Case-insensitive
      }
    });
    return item;
  } catch (error) {
    console.error(error);
    log.error('Datenbankfehler:' + JSON.stringify(error));
    throw error;
  }
}


export async function moveToList(itemId, newList, newStatus) {
  return await DATA_COLL.findOneAndUpdate(
    { _id: new ObjectId(itemId) },
    {
      $set: {
        listType: newList,
        status: newStatus,
        lastUpdated: new Date()
      }
    },
    { returnDocument: 'after' }
  );
}

export async function findSiblings(kennung, searchString) {
  try {
    const escapedString = searchString.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const items = await DATA_COLL.find({
      kennung: { $ne: kennung },
      searchString: {
        $regex: `^${escapedString}( *\\[.*\\])?$`,
        $options: 'i' // Case-insensitive, falls gewünscht
      }
    }).toArray();
    return items;

  } catch (error) {
    console.error(error);
    log.error('Datenbankfehler:' + JSON.stringify(error));
    throw error;
  }
}

export async function changeItem(itemId, newSearchString, newPrio, newDatum) {
  return await DATA_COLL.findOneAndUpdate(
    { _id: new ObjectId(itemId) },
    {
      $set: {
        searchString: newSearchString,
        prio: newPrio || null,
        datum: newDatum,
        lastUpdated: new Date()
      }
    },
    { returnDocument: 'after' } // Gibt das aktualisierte Dokument zurück
  );
}


export async function updateItemById(item, upsert = false) {
  log("updateItemById: ", item.kennung, item.searchString);
  const itemId = item._id;
  const { _id, ...updateData } = item; //  _id entfernen
  const result = await DATA_COLL.findOneAndUpdate(
    { _id: new ObjectId(itemId) },
    {
      $set: {
        ...updateData,
        lastUpdated: new Date()
      }
    },
    {
      upsert,
      returnDocument: 'after'
    }
  );

  //log.debug("updateItemById: " + JSON.stringify(result))
  return result;
}


export async function upsertItem(item) {
  const collection = DATA_COLL;
  if (item._id === undefined) delete item._id;

  // Suchkriterium (Composite Key)
  const filter = {
    searchString: item.searchString,
    kennung: item.kennung,
    mediaType: item.mediaType
  };
  // Update-Daten (inkl. letztem Update-Zeitpunkt)
  const update = {
    $set: {
      ...item,
      lastUpdated: new Date()
    }
  };
  const options = {
    upsert: true,
    returnDocument: 'after' // Gibt das aktualisierte/neue Dokument zurück
  };
  try {
    const result = await collection.findOneAndUpdate(filter, update, options);
    log.debug(`upsertItem completed: ${JSON.stringify(result)}`);
    return result.value;
  } catch (error) {
    log.error('Error in upsertItem:', error);
    throw error;
  }
}

export async function deleteItem(itemId) {
  return await DATA_COLL.deleteOne({ _id: new ObjectId(itemId) });
}


export async function findItems(listType, kennung, sort) {
  let query = {
    listType: (listType === 'watchlist') ? { $in: ['watchlist', 'reservations'] } : listType,
    kennung: (kennung === 'all') ? { $in: ['DÜS', 'THÜR', 'HESS', 'GOET', 'Erledigt'] } : kennung  //TODO demnächst: Erledigt entfernen
  }
  return await DATA_COLL.find(query).sort(sort).toArray();
}


export async function findItemsToClear(monthAgo) {
  /*
  const monthsAgo1 = new Date();
  monthsAgo1.setMonth(monthsAgo1.getMonth() - monthAgo);
  const monthsAgoString1 = monthsAgo1.toISOString().split('T')[0];  // z.B.  monthsAgoString1 = '2024-12-23'

  const query = {
    $or: [
      { listType: { $ne: "donelist" } },
      { datum: { $gte: monthsAgoString1} }
    ]
  }  */

  /* const query = { listType: "donelist" }; */
  const query = {};

  return await DATA_COLL.find(query).sort({ lastUpdated: -1 }).toArray();
}


export async function findEBooksToCheck(days = 22, kennungen = ['DÜS', 'THÜR', 'HESS', 'GOET']) {

  // Berechne Cutoff-Datum
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + days);
  const cutOffDateStr = cutoffDate.toISOString().split('T')[0]

  // Finde relevante Items
  const items = await DATA_COLL.find(
    {
      mediaType: 'eBook',
      kennung: { $in: kennungen },
      listType: 'watchlist',
      datum: { $lte: cutOffDateStr },
      lastUpdated: { $lte: new Date(Date.now() - 60 * 60 * 1000) }      // finde nur items, die mehr als 1 Stunde nicht geändert wurden
    }
  ).sort({ datum: 1, searchString: 1 }).toArray();

  return items;
}

export async function upsertItems(items) {
  let resultCounts = {};

  const bulkOps = items.map(item => {
    return {
      updateOne: {
        filter: {
          $or: [
            {
              mediaId: item.mediaId   // 1. Priorität: echte mediaId
            },
            {
              searchString: item.searchString,    // 2. Fallback nur wenn KEINE gültige mediaId existiert
              kennung: item.kennung,
              mediaType: item.mediaType,
              mediaId: { $in: [null, undefined] }
            }
          ]
        },
        update: {
          $set: {
            ...item,
            datum: item.datum || null,
            lastUpdated: new Date()
          },
          $setOnInsert: {
            createdAt: new Date()
          }
        },
        upsert: true
      }
    };
  });

  if (bulkOps.length > 0) {
    try {
      resultCounts = await DATA_COLL.bulkWrite(bulkOps, { ordered: false });

      log.debug('upsertItems: resultCounts:', resultCounts)

      // Fehler protokollieren
      if (resultCounts.writeErrors > 0) {
        log.error('upsertItems: Fehler beim Bulk-Write:' + JSON.stringify(result.writeErrors));
      }

      return { success: true, resultCounts };

    } catch (error) {
      console.error(error);
      return { error: error.message };
    }
  }

  return { success: 'Keine Operationen ausgeführt' };
}

//************** SEARCHITEMS *********************************************

export async function upsertSearchItem(item) {
  const collection = SEARCH_COLL;

  // Suchkriterium (Composite Key)
  const filter = {
    searchString: item.searchString
  };

  // Update-Daten (inkl. letztem Update-Zeitpunkt)
  const update = {
    $set: {
      ...item,
      available: item.available || [],
      lastUpdated: new Date()
    }
  };

  const options = {
    upsert: true,
    returnDocument: 'after' // Gibt das aktualisierte/neue Dokument zurück
  };

  try {
    const result = await collection.findOneAndUpdate(filter, update, options);
    log.debug(`upsertSearchItem completed: ${JSON.stringify(result)}`);
    return result.value;
  } catch (error) {
    log.error('Error in upsertSearchItem:', error);
    throw error;
  }
}



export async function findSearchItems(filterOptions, sortOptions = {}) {

  const collection = SEARCH_COLL;

  // Filterobjekt aufbauen
  const filter = {};

  // Textsuche (case-insensitive)
  if (filterOptions.searchString) {
    filter.searchString = {
      $text: filterOptions.searchString,
      $options: 'i'
    };
  }

  // Exakte Medien-Typ Übereinstimmung
  if (filterOptions.mediaType) {
    filter.mediaType = filterOptions.mediaType;
  }

  // Exaktes Datum
  if (filterOptions.targetDate) {
    filter.targetDate = {
      $lte: filterOptions.targetDate
    }
  }

  try {
    let result = collection.find(filter).sort(sortOptions);
    return await result.toArray();

  } catch (error) {
    console.error('Fehler bei der Suche:', error);
    throw new Error('Datenbankabfrage fehlgeschlagen');
  }
}

export async function deleteSearchItem(itemId) {
  log.debug('deleteSearchItem: ' + itemId);
  try {
    const result = await SEARCH_COLL.deleteOne({ _id: new ObjectId(itemId) });
    return result;
  } catch (error) {
    log.error('Datenbankfehler:' + JSON.stringify(error));
    throw error;
  }
}


