import { MongoClient, ObjectId } from 'mongodb';
import { logger } from '../utils/log.js';

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

  logger.info(`Database connected: url=${mongoUrl}`);
}

export async function disconnect() {  //not used
  await DBCLIENT.close();
  logger.info('Database disconnected.');
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
    logger.error('Datenbankfehler:' + JSON.stringify(error));
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
    logger.error('Datenbankfehler:' + JSON.stringify(error));
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
    logger.error('Datenbankfehler:' + JSON.stringify(error));
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
    logger.error('Datenbankfehler:' + JSON.stringify(error));
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


export async function upsertItemById(item) {
  const itemId = item._id;
  const result = await DATA_COLL.findOneAndUpdate(
    { _id: new ObjectId(itemId) },
    {
      $set: {
        kennung: item.kennung,
        searchString: item.searchString,
        mediaType: item.mediaType,
        datum: item.datum,
        status: item.status,
        listType: item.listType,
        mediaType: item.mediaType,
        mediaData: item.mediaData,
        prio: item.prio,
        lastUpdated: new Date()
      }
    },
    {
      upsert: true,
      returnDocument: 'after'
    }
  );

  logger.debug("upsertItemById: " + JSON.stringify(result))
  return result;
}

export async function upsertItem(item) {
  const collection = DATA_COLL;
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
    logger.debug(`upsertItem completed: ${JSON.stringify(result)}`);
    return result.value;
  } catch (error) {
    logger.error('Error in upsertItem:', error);
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
  const query = { }; 

  return await DATA_COLL.find(query).sort({ lastUpdated: -1 }).toArray();
}


export async function findItemsToCheck(days = 22) {

  // Berechne Cutoff-Datum
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + parseInt(days));
  const cutOffDateStr = cutoffDate.toISOString().split('T')[0]

  const maxUpdateTimestamp = new Date(Date.now() - 60 * 60 * 1000);

  // Finde relevante Items
  const items = await DATA_COLL.find(
    {
      listType: 'watchlist',
      datum: { $lte: cutOffDateStr },  
      lastUpdated: { $lte: maxUpdateTimestamp }
    }
  ).sort({ datum: 1, searchString: 1 }).toArray();

  return items;
}

export async function upsertItems(items) {
  // Zähler initialisieren
  let insertedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  let availableCount = 0;

  const bulkOps = items.map(item => {
    if (item.status == "*") availableCount++;

    return {
      updateOne: {
        filter: {
          searchString: item.searchString,
          kennung: item.kennung,
          mediaType: item.mediaType
        },
        update: {
          $set: {
            ...item,
            kennung: item.kennung,
            datum: item.datum || null,
            mediaType: item.mediaType,
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
      const result = await DATA_COLL.bulkWrite(bulkOps, { ordered: false });

      // Ergebnisse auswerten
      insertedCount = result.upsertedCount || 0;
      updatedCount = result.modifiedCount || 0;
      errorCount = result.writeErrors?.length || 0;

      // Fehler protokollieren
      if (errorCount > 0) {
        logger.error('upsertItems: Fehler beim Bulk-Write:' + JSON.stringify(result.writeErrors));
      }

      return {
        success: true,
        insertedCount,
        updatedCount,
        errorCount,
        availableCount,
        totalCount: items.length
      };

    } catch (error) {
      logger.error(`upsertItems: Fehler beim Speichern: ` + JSON.stringify(error));
      return {
        success: false,
        error: error.message,
        insertedCount,
        updatedCount,
        availableCount,
        errorCount: errorCount + 1
      };
    }
  }

  return {
    success: true,
    insertedCount: 0,
    updatedCount: 0,
    errorCount: 0,
    message: 'Keine Operationen ausgeführt'
  };
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
    logger.debug(`upsertSearchItem completed: ${JSON.stringify(result)}`);
    return result.value;
  } catch (error) {
    logger.error('Error in upsertSearchItem:', error);
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

    result = result;

    return await result.toArray();

  } catch (error) {
    console.error('Fehler bei der Suche:', error);
    throw new Error('Datenbankabfrage fehlgeschlagen');
  }
}

export async function deleteSearchItem(itemId) {
  logger.debug('deleteSearchItem: ' + itemId);
  try {
    const result = await SEARCH_COLL.deleteOne({ _id: new ObjectId(itemId) });
    return result;
  } catch (error) {
    logger.error('Datenbankfehler:' + JSON.stringify(error));
    throw error;
  }
}