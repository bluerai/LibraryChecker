import { load } from 'cheerio';
import { execSync } from 'child_process';

import { findItemDone, findItemReserved } from '../app/model.js';
import { logger } from './log.js';

const cassisHost = process.env.CASSIS_HOST;

const mediaTypes = {
  "eBook": "400001",
  "eMagazine": "400005",
  "Hörbuch": "400002",
  "Hörspiel": "400003",
  "ePaper": "400006",
  "eLearning": "400013"
}

export function getToday() {
  return new Date().toISOString().split('T')[0]
}

export async function checkCassis(searchString) {
  //logger.debug(`checkCassis: ${searchString}`)
  const url = 'http://' + cassisHost + '/api/count?search=' + encodeURIComponent(searchString);

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
        count: 1,
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
  //logger.debug(`checkDone: ${searchString}`);
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

export async function checkOnleihe(kennung, searchString, mediaType, limit = 1, extendedMode = false) {
  logger.info(`checkOnleihe: kennung=${kennung}, searchString=${searchString}, mediaType=${mediaType}, limit=${limit}`);

  const cmd = buildSearchCmd(kennung, searchString, mediaType);
  logger.debug(`checkOnleihe: cmd=${cmd}`);

  if (!cmd) return [];

  let stdout = "";
  try {
    stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 20000,
      stdio: 'pipe', // Wichtig, um stderr separat zu erfassen
    });
  } catch (error) {
    console.error(error);
    throw new Error(`Fehler bei der Ausführung des Search-Befehls: ${error.message}`);
  }

  const $ = load(stdout);
  let cards = $('section.row').find('div.card-group');

  logger.info(`checkOnleihe: cards.length=${cards.length}`);

  let results = [];

  if (cards.length > 0) {

    const today = getToday();

    for (let index = 0; index < cards.length && results.length < limit; index++) {

      const card = cards[index];
      let status = "";
      const $mediaData = load(card);

      const mediaRef = $mediaData('a.stretched-link[test-id="mediaInfoLink"]').prop('href');

      const mediaId = mediaRef.split("-")[2]

      let available;
      const datumAvail = $mediaData("p.horizontalDescription span[test-id='cardAvailability']").text();

      if (datumAvail === "") {
        const datumStatus = $mediaData("small[test-id='cardAvailability'] p").text();
        if (datumStatus === "Ausgeliehen") {
          available = "";
          status = "+";    //ausgeliehen, nicht vormerkbar
        } else {
          available = today;
          status = "*";    //jetzt ausleihbar
        }
      } else {
        status = "=";   //ausgeliehen, vormerkbar
        available = datumAvail.substring(6, 10) + "-" + datumAvail.substring(3, 5) + "-" + datumAvail.substring(0, 2);
      }

      let datumReceived = $mediaData("p.horizontalDescription span:first").text();
      const received = datumReceived.substring(6, 10) + "-" + datumReceived.substring(3, 5) + "-" + datumReceived.substring(0, 2);
      const author = $mediaData('p.card-text a').text().replaceAll(/[\n ]+/g, " ");  //ggf. mehrere Autoren!
      const title = $mediaData('h3').text().replaceAll(/[\n ]+/g, " ");

      const regExpMatch = searchString.match(/\[.*?\]/); // Nicht-gierige Suche
      const searchSpec = regExpMatch ? " " + regExpMatch[0] : "";
      const itemSearchString = `${(author) ? author + "; " : ""}${title}${searchSpec}`;

      if (extendedMode || containsAllFragments(itemSearchString, searchString)) {

        const mediaData = {
          available,
          author,
          title,
          received,
          count: cards.length,
          kennung,
          mediaRef,
          mediaId
        }

        const result = {
          datum: available,
          status,
          count: cards.length,
          kennung,
          searchString: itemSearchString,
          mediaType,
          mediaData,
          received
        };

        //console.log(result);

        results.push(result);
      }
    }
  }
  if (results.length === 0)
    return [{ status: "!", count: 0, kennung, searchString, datum: "N/A", mediaType, mediaData: { received: "N/A" } }];

  return results;

}

export function queryOnleihe(kennung, category = 155, lang = 'de', count = 100, page = 0) {
  logger.info(`checkOnleihe: kennung=${kennung}, category=${category}, count=${count}, page=${page}`);

  const cmd = buildQueryCmd(kennung, category, lang, count, page);
  logger.debug(`checkOnleihe: cmd=${cmd}`);

  let stdout = "";
  try {
    stdout = execSync(cmd, {
      encoding: 'utf-8',
      maxBuffer: 2 * 1024 * 1024,
      timeout: 20000,
      stdio: 'pipe', // Wichtig, um stderr separat zu erfassen
    });
  } catch (error) {
    //console.error(error);
    throw new Error(`Fehler bei der Ausführung des Query-Befehls: ${error.message}`);
  }
  return stdout;
}

//****************** CURL Commands generieren ************

//const useragent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15";
//const useragent = "Mozilla/5.0 (iPad; CPU OS 14_7_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/137.0 Mobile/15E148 Safari/605.1.15"
const useragent = "Mozilla / 5.0(Windows NT 10.0; Win64; x64; rv: 137.0) Gecko / 20100101 Firefox / 137.0";

export const httpRoot = {
  'DÜS': 'https://www.onleihe.de/duesseldorf/frontend/',
  //'HEiSS': 'https://hessen.onleihe.de/verbund_hessen/frontend/',
  'GOET': 'https://www.onleihe.de/goethe-institut/frontend/',
  'THÜR': 'https://www.onleihe.de/thuebibnet/frontend/'
};

function buildSearchCmd(kennung, searchString, mediaType) {
  const root = httpRoot[kennung];
  if (root) {
    const pmediatype = mediaTypes[mediaType]
    const url = `${root}search,0-0-0-0-0-0-0-0-0-0-0.html`;
    searchString = searchString.replaceAll('`', '``').replaceAll('"', '""');
    return `/usr/bin/curl -s -A "${useragent}"  --form-string "cmdId=703"  --form-string "sK=1000"  --form-string "pMediaType=${pmediatype}" --form-string "pText=${searchString}" "${url}"`
  } else {
    return null;
  }
};

// category: 155 = Krimi&Thriller, 400001=eBooks
function buildQueryCmd(kennung, category, lang, count, page) {
  const url = `${httpRoot[kennung]}mediaList,0-0-0-102-0-0-${page}-2004-400001-0-0.html`;
  return `/usr/bin/curl -s -A "${useragent}" --form-string "category.filter=${category}"  --form-string "elementsPerPage=${count}" --form-string "language.code.filter=${lang}" "${url}"`
};


