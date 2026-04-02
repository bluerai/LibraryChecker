import { findItemDone, findItemReserved } from '../app/model.js';
import { log } from './log.js';

const cassisHost = process.env.CASSIS_HOST;
const scraperHost = process.env.SCRAPER_HOST;

export function getToday() {
  return new Date().toISOString().split('T')[0]
}

export async function checkCassis(item) {
  //log.debug(`checkCassis: ${item.searchString}`)
  const url = `http://${cassisHost}/api/count?search=${encodeURIComponent(item.searchString)}`;

  let result;
  try {
    result = await fetch(url);

  } catch (error) {
    console.error(error);
    throw new Error(`HTTP error! status: ${result.status}`);
  }

  if (!result.ok) {
    const errorData = await result.json();
    log.error('API-Fehler:', errorData);
    throw new Error(`HTTP error! status: ${result.status}`);
  }

  const data = await result.json();

  if (data.count > 0) {
    return { count: data.count, datum: getToday(), status: "^", listType: 'donelist' }
  } else
    return null;
}

export async function searchCassis(searchString) {
  searchString = searchString.split(' [')[0];
  const url = 'http://' + cassisHost + '/api/search?search=' + encodeURIComponent(searchString);
  log(`searchCassis: url=${url}`);

  let result;
  try {

    result = await fetch(url);

  } catch (error) {
    console.error('Fehlertyp:', error.name); // → z. B. "TypeError", "AbortError"
    console.error('Fehlermeldung:', error.message);
    // Weitere systemabhängige Eigenschaften:
    console.error('Code:', error.code); // → z. B. "ENOTFOUND" (DNS), "ECONNREFUSED"
    console.error('Stack:', error.stack);

    throw new Error(`HTTP error! ${JSON.stringify(result)}`);
  }

  if (!result.ok) {
    const errorData = await result.json();
    log.error('API-Fehler:', errorData);
    throw new Error(`HTTP error! ${JSON.stringify(result)}`);
  }

  const data = await result.json();

  const items = data.books.map((item) => {
    return (
      {
        bookId: item.bookId,
        kennung: 'CASSIS',
        searchString: item.search_string,
        datum: item.timestamp.split(' ')[0],
        status: "^",
        series_name: item.series_name,
        series_index: item.series_index,
        mediaData: {
          title: item.title
        }
      }
    )
  })

  return items;
}

export async function checkDone(searchString) {
  //log.debug(`checkDone: ${searchString}`);
  return await findItemDone(searchString);
}

export async function checkReserved(kennung, searchString) {
  //log.debug(`checkReserved: ${searchString}`);
  return await findItemReserved(kennung, searchString);
}

/* export async function searchCheckLib(searchString) {
  searchString = searchString.split(' [')[0];
  return await findAllItems(searchString);
} */

// Normalisierung: Kleinbuchstaben, Sonderzeichen durch Leerzeichen ersetzen
const whitespace_chars = /[\/\,\.\|\ \*\?\!\:\;\(\)\[\]\&\"\+\-\_\%]+/g;
//whitespace_char01: In der Onleihe Zeichen zur Abtrennung des Artikels am Anfang von Titeln (für die Sortierung):
const whitespace_char01 = String.fromCharCode(172);


function normalizeString(str) {
  return str.toLowerCase()
    .replaceAll(whitespace_char01, " ")
    .replaceAll(whitespace_chars, " ")
    .replace(/\s+/g, ' ')          // Mehrfache Leerzeichen zu einem
    .trim();
}

function containsAllFragments(itemSearchString, searchString) {
  //Prüft, ob alle Textstücke aus fragmentString in normItemString enthalten sind
  itemSearchString = normalizeString(itemSearchString);
  searchString = normalizeString(searchString);

  // Wenn searchString leer ist, gilt es als "enthalten"
  if (!searchString) return true;

  // Zerlege searchString in Wörter/Fragmente
  const fragments = searchString.split(' ');

  // Prüfe ob alle Fragmente in searchString in itemSearchString vorkommen
  return fragments.every(fragment =>
    fragment && itemSearchString.includes(fragment)
  );

}

export async function checkOnleihe(item0, limit = 1) {
  log.debug('checkOnleihe:', item0.kennung, item0.searchString, 'Limit:', limit);

  let url;
  if (['HESS', 'DÜS'].includes(item0.kennung))
    url = ((limit !== 1) || (['ePaper', 'eMagazine'].includes(item0.mediaType)) || !(item0.mediaData?.mediaId) || item0.mediaData.mediaId.length <= 12) ?
      `http://${scraperHost}/search3` :
      `http://${scraperHost}/details`;

  else if (['THÜR', 'GOET'].includes(item0.kennung))
    url = `http://${scraperHost}/search2`

  else return [];

  log("checkOnleihe url:", url);
  log({ item: item0, limit: limit });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item: item0, limit: limit })
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error)
  if (data.length == 0) return data;

  log('checkOnleihe: data.length=', data.length);
  //log.debug('checkOnleihe: data=', data[0]);

  let results = [];

  const today = getToday();

  for (let index = 0; index < data.length; index++) {
    const item = data[index];
    let available = item.datum;
    let status = "";

    if (available === "") {
      available = today;
      status = "*";    //jetzt ausleihbar

    } else {
      status = "=";   //ausgeliehen, vormerkbar
    }

    const author = item.author?.replaceAll(/[\n ]+/g, " ");  //ggf. mehrere Autoren!
    const title = item.title?.replaceAll(/[\n ]+/g, " ");


    let searchSpec = "";
    if (item0.searchString) {
      const regExpMatch = item0.searchString.match(/\[.*?\]/); // Nicht-gierige Suche
      searchSpec = regExpMatch ? " " + regExpMatch[0] : "";
    }
    const itemSearchString = `${(author) ? author + "; " : ""}${title}${searchSpec}`;

    if (containsAllFragments(itemSearchString, item0.searchString)) {

      const mediaData = {
        author,
        title,
        kennung: item0.kennung,
        mediaRef: item.mediaRef,
        mediaId: item.mediaId,
      }

      const result = {
        _id: item0._id,
        datum: available,
        status,
        kennung: item0.kennung,
        searchString: itemSearchString,
        mediaType: item.mediaType,
        received: item.received || item0.received,
        mediaData
      };

      if (mediaData.mediaId && mediaData.mediaId.length > 12) result.mediaId = mediaData.mediaId;

      results.push(result);
    }
  }

  /* if (results.length === 0)
    results.push({ status: "!", kennung: item0.kennung, searchString: item0.searchString, datum: "N/A", mediaType: item0.mediaType });
 */

  return results;

}

export async function queryOnleihe(kennung, limit) {
  log(`queryOnleihe: kennung=${kennung}, limit=${limit}`);

  const url = `http://${scraperHost}/list/${encodeURIComponent(kennung)}/${limit}`;

  let data = [];
  try {
    const result = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    data = await result.json();

  } catch (error) {
    console.error(error);
    throw new Error(`error in queryOnleihe: ${error.message}`);
  }
  return data;
}


export async function processImportedData(kennung, data) {
  //log.debug(`processImportedData kennung:`, kennung, 'dataLength:', data.length)
  const today = getToday();

  const results = [];

  let watchListCount = 0;
  let donelistCount = 0;
  let reservationsCount = 0;
  let cassisCount = 0;
  let availableCount = 0;
  let availDateCount = 0;

  for (const card of data) {

    const datum = card.datum || today;
    let available = datum
    const mediaType = card.mediaType;
    const mediaId = card.mediaId;
    const author = card.author;
    const title = card.title;

    let searchString = `${(author) ? author + "; " : ""}${title}`;
    let status = "?";
    let listType;

    if (await checkCassis({ searchString })) {
      status = "^";
      listType = 'donelist';
      cassisCount++
    } else {
      const item0 = await checkReserved(kennung, searchString);
      if (item0) {
        //searchString = item0.searchString
        available = item0.datum; //Datum bleibt!
        status = "#";
        listType = 'reservations';
        reservationsCount++

      } else {
        const item0 = await checkDone(searchString);
        if (item0) {
          //searchString = item0.searchString
          status = ">";
          listType = 'donelist';
          donelistCount++
        } else {
          if (available === "") {
            status = "*";
            availableCount++;
          } else {
            status = "=";
            watchListCount++
          }
          listType = 'watchlist';
        }
      }
    }

    if (datum !== available && listType === 'watchlist') availDateCount++;

    const mediaData = {
      available,
      author: author,
      title,
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
      listType
    };

    if (mediaData.mediaId && mediaData.mediaId.length > 12) result.mediaId = mediaData.mediaId;

    // nur sichern, wenn nicht in Cassis!!!
    if (result.status !== "^") {
      results.push(result);
    }

  }
  const counts = { availableCount, watchListCount, donelistCount, reservationsCount, cassisCount, availDateCount };

  return { results, counts };

}
