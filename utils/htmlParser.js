
import { load } from 'cheerio';

import { checkCassis, checkDone, checkReserved } from '../utils/searchForBooks.js';
import { logger } from '../utils/log.js';

const kennungen = {
  'Stadtbücherei Düsseldorf': 'DÜS',
  'OnleiheVerbundHessen': 'HESS',
  'BibliothekThüringen': 'THÜR',
  'Goethe-Institut': 'GOET'
};

const mediaTypes = {
  "ic_ebook": "eBook",
  "ic_emagazin": "eMagazine",
  "ic_eaudio": "Hörbuch",
  "ic_emusic": "Hörspiel",
  "ic_epaper": "ePaper",
  "ic_elearning": "eLearning",
  "ic_evideo": "Video"
}

export function getToday() {
  return new Date().toISOString().split('T')[0]
}

export async function processHtml(html) {
  logger.info(`processHtml`)

  const $ = load(html);
  const results = [];

  console.log($('meta[name="author"]').prop("content"));

  const kennung = kennungen[$('meta[name="author"]').prop("content")]

  if (!kennung) { return null; }

  const title = $('title').text();
  const importType = (title.includes("Mein Konto")) ? "reservations" : "watchlist";

  let cards;
  if (importType === 'watchlist')
    cards = $('section.row').find('div.card-group');  // alle anderen
  else
    cards = $('.reservations.row').find('.card');  //reserved

  const authorSelector =
    (importType === 'watchlist') ? 'p.card-text a' : 'div[test-id="cardAuthor"] a[title="Details"]';

  logger.debug(`parseHtml: ${importType} ${kennung}: ${cards.length} cards found`);

  const today = getToday();

  for (const card of cards) {
    //HTML-Tags aus Input lesen und item erstellen


    const $mediaData = load(card);

    let available;
    const datumAvail = (importType === 'watchlist') ?
      $mediaData("p.horizontalDescription span[test-id='cardAvailability']").text() :
      $mediaData("p.horizontalDescription span[test-id='cardActivationDate']").text();

    const datumReceived = $mediaData("p.horizontalDescription span:first").text();

    const mediaType = mediaTypes[$mediaData('.text-end svg').prop('test-id')];

    const mediaRef = $mediaData('a.stretched-link[test-id="mediaInfoLink"]').prop('href');

    const mediaId = mediaRef.split("-")[2]

    const received = datumReceived.substring(6, 10) + "-" + datumReceived.substring(3, 5) + "-" + datumReceived.substring(0, 2);

    const author = $mediaData(authorSelector).text().replaceAll(/[\n ]+/g, " ");  //ggf. mehrere Autoren!

    const title = $mediaData('h3').text().replaceAll(/[\n ]+/g, " ");

    let searchString = `${(author) ? author + "; " : ""}${title}`;

    let status = ""

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
      status = "=";    //jetzt ausleihbar
      available = datumAvail.substring(6, 10) + "-" + datumAvail.substring(3, 5) + "-" + datumAvail.substring(0, 2);
    }

    let listType = importType;

    if (importType === 'watchlist') {
      if (await checkCassis(searchString)) {
        //logger.debug(`parseHtml: ^ ${available} Cassis: ${searchString}`)
        status = "^";
        listType = 'donelist';

      } else {
        const item0 = await checkReserved(kennung, searchString);
        if (item0) {
          searchString = item0.searchString
          available = item0.datum; //Datum bleibt!
          logger.debug(`parseHtml: # already in reservations: ${searchString} - ${available}`);
          status = "#";
          listType = 'reservations';
        } else {
          const item0 = await checkDone(searchString);
          if (item0) {
            logger.debug(`parseHtml: x ${available} erledigt: ${item0.searchString}`)
            searchString = item0.searchString
            status = ">";
            listType = 'donelist';
          }
        }
      }
    } else {
      const item0 = await checkReserved(kennung, searchString);
      if (item0) {
        console.log(item0);
        searchString = item0.searchString;
        //Datum wird übernommen
        logger.debug(`parseHtml: # already in reservations: ${searchString} - ${available}`);
      } else {
        logger.debug(`parseHtml: # new in reservations: ${searchString} - ${available}`);
      }
      status = "#";
      listType = 'reservations';
    }

    if (listType) {

      const mediaData = {
        available,
        author: author,
        title,
        received,
        kennung,
        mediaRef,
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

      //console.log("processHtml", result);

      // nur sichern, wenn nicht in Cassis!!!
      if (result.status !== "^") results.push(result);
    }
  }

  return results;

}


export async function processJson(kennung, items) {
  logger.info(`parseJson: ${kennung}: ${items.length} items found`);

  if (!kennung) { return null; }

  const results = [];

  const importType = "watchlist";

  for (const item of items) {
    const mediaType = item.typ;
    const mediaRef = undefined;
    const mediaId = item.mediaId;
    const received = undefined;
    const author = item.autor.replaceAll(/[\n ]+/g, " ");  //ggf. mehrere Autoren!
    const title = item.titel.replaceAll(/[\n ]+/g, " ");

    let searchString = `${(author) ? author + "; " : ""}${title}`;
    let available = (item.datum) ?
      item.datum.substring(6, 10) + "-" + item.datum.substring(3, 5) + "-" + item.datum.substring(0, 2) :
      undefined;
    let status = (available) ? "=" : "*"
    let listType = importType;

    if (await checkCassis(searchString)) {
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
        mediaRef,
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