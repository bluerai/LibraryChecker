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


export async function updateItemById(item) {
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
        received: item.received,
        prio: item.prio,
        lastUpdated: new Date()
      }
    },
    {
      upsert: false,
      returnDocument: 'after'
    }
  );

  logger.debug("upsertItemById: " + JSON.stringify(result))
  return result;
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
        received: item.received,
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
    console.log('Error in upsertItem:', item)
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
  const query = {};

  return await DATA_COLL.find(query).sort({ lastUpdated: -1 }).toArray();
}


export async function findEBooksToCheck(days = 22) {

  // Berechne Cutoff-Datum
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + parseInt(days));
  const cutOffDateStr = cutoffDate.toISOString().split('T')[0]

  const maxUpdateTimestamp = new Date(Date.now() - 60 * 60 * 1000);

  // Finde relevante Items
  const items = await DATA_COLL.find(
    {
      mediaType: 'eBook',
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
// ================ Konvertierungen =================
async function deleteStringMediaData() {
  const result = await DATA_COLL.updateMany(
    { mediaData: { $type: "string" } },
    { $unset: { mediaData: 1 } }
  );

  console.log(`${result.modifiedCount} mediaData-Strings gelöscht`);
  return result.modifiedCount;
}

async function processSearchStrings() {
  try {
    // Erst alle Dokumente als Array holen (einfacher zu debuggen)
    const docs = await DATA_COLL.find({
      searchString: { $regex: /^[^,]*,[^;]*;[^;]*$/ }
    }).toArray();

    console.log(`Gefundene Dokumente: ${docs.length}`);

    let processedCount = 0;
    let errorCount = 0;

    for (const doc of docs) {
      try {
        // Ausführliche Validierung
        if (!doc || typeof doc !== 'object') {
          console.warn('Ungültiges Dokument (kein Objekt):', doc);
          errorCount++;
          continue;
        }

        if (!doc._id) {
          console.warn('Dokument ohne _id:', doc);
          errorCount++;
          continue;
        }

        if (!doc.searchString || typeof doc.searchString !== 'string') {
          console.warn(`Dokument ${doc._id} hat kein gültiges searchString-Feld`);
          continue;
        }

        // Positionen finden
        const commaIndex = doc.searchString.indexOf(',');
        const semicolonIndex = doc.searchString.indexOf(';');

        if (commaIndex === -1 || semicolonIndex === -1 || commaIndex > semicolonIndex) {
          continue;
        }

        // Prüfen auf weitere Semikolons
        if (doc.searchString.indexOf(';', semicolonIndex + 1) !== -1) {
          continue;
        }

        // Teile extrahieren
        const nachname = doc.searchString.substring(0, commaIndex).trim();
        const vornameTeil = doc.searchString.substring(commaIndex + 1, semicolonIndex).trim();
        const titel = doc.searchString.substring(semicolonIndex + 1).trim();

        if (!nachname || !vornameTeil || !titel) {
          continue;
        }

        // Update vorbereiten
        const updateDoc = {};

        // mediaData.author aktualisieren falls nötig
        if (!doc.mediaData?.author?.trim()) {
          updateDoc['mediaData.author'] = `${vornameTeil} ${nachname}`;
        }

        // mediaData.title aktualisieren falls nötig
        if (!doc.mediaData?.title?.trim()) {
          updateDoc['mediaData.title'] = titel;
        }

        // searchString aktualisieren
        const neuerSearchString = `${doc.mediaData?.author || `${vornameTeil} ${nachname}`}; ${doc.mediaData?.title || titel}`;

        if (doc.searchString !== neuerSearchString) {
          updateDoc.searchString = neuerSearchString;
        }

        // Nur updaten wenn es Änderungen gibt
        if (Object.keys(updateDoc).length > 0) {
          await DATA_COLL.updateOne(
            { _id: doc._id },
            { $set: updateDoc }
          );
          processedCount++;
          console.log(`Aktualisiert: ${doc._id}`);
        }

      } catch (docError) {
        console.error('Fehler bei Dokument:', doc?._id, docError);
        errorCount++;
      }
    }

    console.log(`Verarbeitung abgeschlossen: ${processedCount} aktualisiert, ${errorCount} Fehler`);
    return { processed: processedCount, errors: errorCount };

  } catch (error) {
    console.error('Schwerwiegender Fehler:', error);
    throw error;
  }
}

async function convertAutor() {
  const filter = {
    "mediaData.author": /,/
  };

  let cursor = DATA_COLL.find(filter);

  //cursor = cursor.limit(count);

  let converted = 0;

  cursor.forEach(doc => {
    const authorField = doc.mediaData?.author;
    const title = doc.mediaData?.title;

    if (!authorField || !title) return;

    const authors = authorField.split(";").map(a => a.trim());

    const convertedAuthors = authors.map(a => {
      if (!a.includes(",")) return a;

      const [last, first] = a.split(",").map(p => p.trim());
      return `${first} ${last}`.trim();
    });

    const newAuthor = convertedAuthors.join("; ");
    const newSearchString = `${newAuthor}; ${title}`;

    DATA_COLL.updateOne(
      { _id: doc._id },
      {
        $set: {
          "mediaData.author": newAuthor,
          searchString: newSearchString,
          lastUpdated: new Date()
        }
      }
    );

    logger.debug(`convertAutor: ${authorField} --> ${newAuthor}`)

    converted++;
  });

}

export async function convert() {
  convertAutor();
  deleteStringMediaData() 
  processSearchStrings();
}

