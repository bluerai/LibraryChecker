import { findItemDone, findItemReserved } from '../app/model.js';
import { logger } from './log.js';

const cassisHost = process.env.CASSIS_HOST;
const scraperHost = process.env.SCRAPER_HOST;

export function getToday() {
  return new Date().toISOString().split('T')[0]
}

export async function checkCassis(item) {
  logger.debug(`checkCassis: ${item.searchString}`)
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
    console.log('API-Fehler:', errorData);
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
  logger.info(`searchCassis: url=${url}`);

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
    console.log('API-Fehler:', errorData);
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
  logger.debug(`checkDone: ${searchString}`);
  return await findItemDone(searchString);
}

export async function checkReserved(kennung, searchString) {
  //logger.debug(`checkReserved: ${searchString}`);
  return await findItemReserved(kennung, searchString);
}

export async function searchCheckLib(searchString) {
  searchString = searchString.split(' [')[0];
  return await findAllItems(searchString);
}

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
  console.log('checkOnleihe:', item0, 'Limit:', limit);

  let url;
  if (['HESS', 'DÜS'].includes(item0.kennung)) url = `http://${scraperHost}/search3`
  else if (['THÜR', 'GOET'].includes(item0.kennung)) url = `http://${scraperHost}/search2`
  else return [];

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item: item0, limit: limit })
  });

  const data = await res.json();

  if (data.error) throw new Error(data.error)

  if (data.length == 0) return data;

  console.log('checkOnleihe: data=', data);

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

    const author = item.author.replaceAll(/[\n ]+/g, " ");  //ggf. mehrere Autoren!
    const title = item.title.replaceAll(/[\n ]+/g, " ");


    let searchSpec = "";
    if (item0.searchString) {
      const regExpMatch = item0.searchString.match(/\[.*?\]/); // Nicht-gierige Suche
      searchSpec = regExpMatch ? " " + regExpMatch[0] : "";
    }
    const itemSearchString = `${(author) ? author + "; " : ""}${title}${searchSpec}`;

    if (containsAllFragments(itemSearchString, item0.searchString)) {

      const mediaData = {
        available,
        author,
        title,
        kennung: item0.kennung,
        mediaId: item.mediaId,
        mediaRef: item.mediaRef
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

      //console.log(result);

      results.push(result);
    }
  }

  /* if (results.length === 0)
    results.push({ status: "!", kennung: item0.kennung, searchString: item0.searchString, datum: "N/A", mediaType: item0.mediaType });
 */

  console.log(results);

  return results;

}

