let RELOAD_NEEDED = false;
let CURRENT_PATH = '';
let LIST_FETCHPATH = '';
let FILTER_TEXT = '';
let FILTER_PRIO = false;
let FILTER_RESERV = false;
let CUR_ITEM;
let TARGET_ID;

let TOKEN = localStorage.getItem('token');

// login ===================================================================

async function validate() {
  try {
    const result = await fetch("/verify", { headers: { 'Authorization': `Bearer ${TOKEN}` } });
    const data = await result.json();
    switch (result.status) {
      case 200: {
        document.getElementById('app').style.display = 'block';
        console.log("verifyUser: Valid token - user=" + data.user.username + ", expire in: " + data.user.exp);
        //displayMessage(': Login "' + data.user.username + '" gültig bis ' + (new Date(data.user.exp * 1000).toLocaleDateString()), 5);
        break;
      }
      case 401: {
        console.log(data.error);
        document.getElementById('login').innerHTML = data.html;
        document.querySelectorAll('.right').forEach(el => el.style.display = 'none');
        break;
      }
      default: {
        console.log("verifyUser: response failed");
      }
    }
  } catch (error) {
    console.error('validate error:', error);
  }
}

async function login(first_login) {
  const loginForm = document.getElementById('loginForm');

  if (loginForm) {
    const formData = new FormData(loginForm);
    const entries = Object.fromEntries(formData.entries());

    if (first_login) {
      if (data.password !== data.password2) {
        //displayMessage('Passwords do not match. Try again!', 5);
        return;
      }
    }

    try {
      const result = await fetch("/login", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
        body: JSON.stringify(entries),
      });

      const data = await result.json();

      if (result.ok) {
        TOKEN = data.token;
        localStorage.setItem('token', data.token);
        document.querySelectorAll('.right').forEach(el => el.style.display = 'block');
        document.getElementById('login').innerHTML = '';
        document.getElementById('app').style.display = 'block';
      } else {
        console.error("login: Credentials not valid. Try again!");
      }
    } catch (error) {
      console.error('login error:', error);
    }
  }
}

validate();

//******************************************************************
//*********** Funktionalitäten *************************************
//******************************************************************


function reload() {
  localStorage.removeItem('token');
  location.reload(true);
}


function closeAll() {
  closeTableContainer();
  document.getElementById("item_panel").innerHTML = '';
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.style.display = 'none';
  });
}


//******************************************************************
//*********** Merklisten *******************************************
//******************************************************************

function getWatchlist(kennung) {
  getList({ 'listType': 'watchlist', 'kennung': kennung, 'sort': 'datum', 'dir': 'desc' })
}

/* function getReservations(kennung) {
  getList({ 'listType': 'reservations', 'kennung': kennung, 'sort': 'datum', 'dir': 'desc' })
} */

function getDonelist(kennung) {
  getList({ 'listType': 'donelist', 'kennung': kennung, 'sort': 'lastUpdated', 'dir': 'asc' })
}
/* 
function getSearchlist(searchString, mediaType, extendedMode, kennungen) {
  getList({ 'listType': 'searchlist', searchString, mediaType, extendedMode, kennungen }) })
} */

async function getList(options) { // options:  { listType, kennung, sort, dir } 
  try {
    const statusmsg = document.querySelector('#itemlist_panel  .statusmsg');
    statusmsg.style.display = 'block';
    insertTextWithSpinner(statusmsg, "Merkliste abrufen ... ");

    options.dir = (options.dir === 'asc' ? 'desc' : 'asc')
    const query = new URLSearchParams(Object.entries(options)).toString();

    LIST_FETCHPATH = `/list?${query}`;
    const result = await fetch(LIST_FETCHPATH, { headers: { 'Authorization': `Bearer ${TOKEN}` } });

    if (result.ok) {
      const data = await result.json();
      document.getElementById('table_container').innerHTML = data.html;
      document.getElementById('table_container').style.display = 'block';
      document.querySelector('#listButtons .active')?.classList.remove('active');
      document.getElementById(options.listType).classList.add('active')
      if (options.listType === 'donelist')
        filterTable(FILTER_TEXT);
      else
        filterTable(FILTER_TEXT, FILTER_PRIO, FILTER_RESERV);


    } else {
      const data = await result.json();
      data.message && showToast('getList: ' + data.message, 'warning');
    }

    document.getElementById('searchInput').value = FILTER_TEXT;
    document.getElementById('prioInput').checked = FILTER_PRIO;
    document.getElementById('reservInput').checked = FILTER_RESERV;
    loadSearchModal();
    setTimeout(() => statusmsg.style.display = 'none', 300);

  } catch (error) {
    showToast('getList Fehler: ' + error.message, 'warning');
  }
}

async function reloadList(listpath, targetId) {
  listpath = listpath || LIST_FETCHPATH
  if (listpath)
    try {
      //Filterwerte zurücksetzen
      FILTER_TEXT = '';
      FILTER_PRIO = false;
      FILTER_RESERV = false;

      const statusmsg = document.querySelector('#itemlist_panel  .statusmsg');
      statusmsg.style.display = 'block';
      insertTextWithSpinner(statusmsg, "Merkliste aktualisieren ... ");

      const result = await fetch(listpath, { headers: { 'Authorization': `Bearer ${TOKEN}` } });

      const data = await result.json();

      if (result.ok) {
        document.getElementById('table_container').innerHTML = data.html;
        //document.getElementById('itemlist_panel').scrollIntoView({ block: 'start' });

        filterTable();

        LIST_FETCHPATH = listpath;
        if (targetId) {
          const target = document.getElementById(targetId);
          target.scrollIntoView({ block: 'center' });
          target.classList.add('marked');
          setTimeout(() => {
            target.classList.remove('marked');;
          }, 2000);
        }
        loadSearchModal();
      } else {
        showToast('reloadList: ' + data.message, 'warning');
      }

      document.getElementById('searchInput').value = FILTER_TEXT;
      document.getElementById('prioInput').checked = FILTER_PRIO;
      document.getElementById('reservInput').checked = FILTER_RESERV;
      loadSearchModal();
      setTimeout(() => statusmsg.style.display = 'none', 300);

    } catch (error) {
      showToast('reloadList Fehler: ' + error.message, 'warning');
    }
}

function loadSearchModal() {
  // Modal-Elemente
  const searchModalElement = document.getElementById('searchModal');
  const searchModal = new bootstrap.Modal(searchModalElement);
  const textSearchButton = document.getElementById('textSearchButton');
  const searchInput = document.getElementById('searchInput');
  const prioInput = document.getElementById('prioInput');

  searchModalElement.addEventListener('shown.bs.modal', () => {
    searchInput.focus();
  });

  // Suche ausführen
  textSearchButton.addEventListener('click', launchFilterTable);

  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      launchFilterTable();
    }
  });

  function launchFilterTable() {
    FILTER_TEXT = searchInput.value;
    FILTER_PRIO = prioInput.checked;
    FILTER_RESERV = reservInput.checked;
    filterTable(FILTER_TEXT, FILTER_PRIO, FILTER_RESERV);
    searchModal.hide();
  }
}

function filterTable(filterText = '', filterPrio = false, filterReserv = false) {
  const rows = document.getElementsByClassName('itemrow');
  const searchInput = filterText.toLowerCase().trim();

  const modal = document.getElementById('openFilterModal');
  if (modal)
    if (filterText === '' && filterPrio == false && filterReserv == false) {
      modal.classList.replace('btn-danger', 'btn-secondary');
    } else {
      modal.classList.replace('btn-secondary', 'btn-danger');
    }

  let filterCount = 0;
  Array.from(rows).forEach(row => {
    try {
      const searchStringCell = row.querySelector('.itemText');
      const searchString = (searchStringCell) ? searchStringCell.innerText.toLowerCase() : '';

      let displayCondition;

      if (filterPrio && (row.getElementsByClassName("prio").length === 0))
        displayCondition = false;
      else if (filterReserv && (row.getElementsByClassName("statusCell")[0].textContent !== "#"))
        displayCondition = false;
      else {
        displayCondition = searchString.includes(searchInput);
        (displayCondition) && filterCount++;
      }
      row.style.display = (displayCondition ? '' : 'none');

    } catch (e) {
      console.error('Fehler beim Filtern:', e);
      row.style.display = '';
    }
  });
  document.getElementById('filterLength').textContent = filterCount;
}


//******************************************************************
//*********** Item-Menu-Funktionen *********************************
//******************************************************************

async function openItemMenu(item, targetId) {
  if (item.kennung === 'CASSIS') return;

  try {
    const result = await fetch("/menu/", {
      method: "POST",
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ item, targetId, listpath: LIST_FETCHPATH })
    })

    const data = await result.json();
    if (result.ok) {
      document.getElementById('item_panel').outerHTML = data.html;
      document.getElementById('app').scrollIntoView({ block: 'start' });
      document.getElementById('item_panel').style.display = 'block';
      document.getElementById('header_panel').style.display = 'none';

      CUR_ITEM = item;
      TARGET_ID = targetId;
    } else {
      showToast('getList: ' + data.message, 'warning');
    }
  } catch (error) {
    showToast('getList Fehler: ' + error.message, 'warning');
  }
}

function closeItemMenu() {  // menu - Schließen
  document.getElementById('item_panel').innerHTML = '';
  document.getElementById('header_panel').style.display = 'block';
  document.getElementById('table_container').style.display = 'block';
  if (RELOAD_NEEDED) {
    reloadList()
    RELOAD_NEEDED = false; // Tabelle aktualisieren
  }
}

const httpRoot = {
  'DÜS': 'https://www.onleihe.de/duesseldorf/frontend/',
  //'HEiSS': 'https://hessen.onleihe.de/verbund_hessen/frontend/',
  'GOET': 'https://www.onleihe.de/goethe-institut/frontend/',
  'THÜR': 'https://www.onleihe.de/thuebibnet/frontend/'
};

async function updateItem(item, targetId) {  // Menu - aktualisieren
  try {
    item.searchString = document.getElementById('searchString').value;
    item.prio = document.getElementById('priobox').checked;
    if (!item.listType) item.listType = 'watchlist';

    const result = await fetch('/upsert/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ item, targetId })
    });

    const data = await result.json();
    if (result.ok) {
      if (targetId && document.getElementById(targetId)) {
        document.getElementById(targetId).outerHTML = data.html;
      }

      const statusInput = document.getElementById('status');
      statusInput.outerHTML = `
        <input class="form-control text-center statusCell me-2" id="status" type="text" style="width:40px 
          readonly="readonly" title="Status" value="${data.options.item.status}">`
      document.getElementById('datum').value = data.options.item.datum;
      document.getElementById('lastUpdated').value = data.options.item.lastUpdated || "N/A";

      const logoButton = document.getElementById('logo-button');
      logoButton.outerHTML = `
        <a class="btn btn-sm btn-outline-secondary" id="logo-button" style="width:40px; height: 40px" 
          href="${data.options.url}" target="_blank" rel="noopener noreferrer"></a>`;

      const message = data.options.message;
      if (message && message.length > 0)
        showToast(message, 'info');
      else
        showToast("Keine Änderung der Verfügbarkeit", 'info');

      RELOAD_NEEDED = true;

    } else {
      showToast('updateItem: ' + data.message, 'warning');
    }
  } catch (error) {
    showToast('updateItem Fehler: ' + error.message, 'warning');
  }
}

async function importItem(item, targetId, event) {  // Menu - übernehmen
  if (event) event.stopPropagation();
  try {
    if (!event) {     //Aufruf aus item-Maske
      item.searchString = document.getElementById('searchString').value;
      item.prio = document.getElementById('priobox').checked;
    }
    if (!item.listType) item.listType = 'watchlist';

    const result = await fetch('/upsert/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ item, targetId })
    });

    const data = await result.json();

    if (result.ok) {
      if (targetId && document.getElementById(targetId)) {
        if (targetId.startsWith('item_')) {
          document.getElementById(targetId).remove();
          const listLen = document.getElementById('listLength');
          if (listLen) listLen.innerHTML = listLen.innerHTML - 1;

        } else if (targetId.startsWith('result_')) {
          document.getElementById(targetId).outerHTML = data.html;
        }
      }
      document.getElementById('item_panel').innerHTML = '';
      document.getElementById('header_panel').style.display = 'block';
      document.getElementById('table_container').style.display = 'block';

    } else {
      showToast('importItem: ' + data.message, 'warning');
    }

  } catch (error) {
    showToast('importItem Fehler: ' + error.message, 'warning');
  }
}

async function changeItem(itemId, targetId) {
  try {
    if (!confirm("Änderung speichern?")) {
      document.getElementById('priobox').checked = CUR_ITEM.prio;
      document.getElementById('searchString').value = CUR_ITEM.searchString;
      document.getElementById('datum').value = CUR_ITEM.datum;
      return;
    }

    const prio = document.getElementById('priobox').checked;
    const searchString = document.getElementById('searchString').value;
    const datum = document.getElementById('datum').value;

    const result = await fetch('/change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: `{ "itemId": "${itemId}", "searchString": "${searchString}", "prio": ${prio}, "datum": "${datum}", "targetId": "${targetId}" }`
    });

    const data = await result.json();
    if (result.ok) {
      document.getElementById(targetId).outerHTML = data.html;
    } else {
      showToast('importItem: ' + data.message, 'warning');
    }
  } catch (error) {
    showToast('importItem Fehler: ' + error.message, 'warning');
  }
}

function gotoTarget(targetId, listpath) {
  if (listpath !== LIST_FETCHPATH)
    reloadList(listpath, targetId);
  else {
    const target = document.getElementById(targetId);
    target.scrollIntoView({ block: 'center' });
    target.classList.add('marked');
    setTimeout(() => {
      target.classList.remove('marked');;
    }, 2000);
  }
}

async function setItemDone(itemId, targetId, event) {
  if (event) event.stopPropagation();
  if (confirm(`Der Eintrag wird in die Liste "Erledigt" verschoben. Bitte bestätigen.`)) {
    try {
      const result = await fetch('/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
        body: `{ "itemId": "${itemId}", "targetId": "${targetId}" }`
      });

      const data = await result.json();
      if (result.ok) {
        if (targetId && document.getElementById(targetId)) {
          if (targetId.startsWith('item_')) {
            /*             document.getElementById(targetId).remove();
                        const listLen = document.getElementById('listLength');
                        if (listLen) listLen.innerHTML = listLen.innerHTML - 1; */
            reloadList();
          } else if (targetId.startsWith('result_')) {
            document.getElementById(targetId).outerHTML = data.html;
          }
        }
        document.getElementById('item_panel').innerHTML = '';
        document.getElementById('header_panel').style.display = 'block';
        document.getElementById('table_container').style.display = 'block';
      } else {
        showToast('setItemDone: ' + data.message, 'warning');
      }
    } catch (error) {
      showToast('setItemDone Fehler: ' + error.message, 'warning');
    }
  }
}

async function setItemReserved(itemId, targetId) {
  try {
    const result = await fetch('/reserved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: `{ "itemId": "${itemId}", "targetId": "${targetId}" }`
    });

    const data = await result.json();
    if (result.ok) {
      if (targetId && document.getElementById(targetId)) {
        if (targetId.startsWith('item_')) {
          /*           document.getElementById(targetId).remove();
                    const listLen = document.getElementById('listLength');
                    if (listLen) listLen.innerHTML = listLen.innerHTML - 1; */
          reloadList();

        } else if (targetId.startsWith('result_')) {
          document.getElementById(targetId).outerHTML = data.html;
        }
      }
      document.getElementById('item_panel').innerHTML = '';
      document.getElementById('header_panel').style.display = 'block';
      document.getElementById('table_container').style.display = 'block';

    } else {
      showToast('setItemReserved: ' + data.message, 'warning');
    }
  } catch (error) {
    showToast('setItemReserved Fehler: ' + error.message, 'warning');
  }
}

async function setItemActive(itemId, targetId) {
  try {
    const result = await fetch('/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: `{ "itemId": "${itemId}", "targetId": "${targetId}" }`
    });

    const data = await result.json();
    if (result.ok) {
      if (targetId && document.getElementById(targetId)) {
        if (targetId.startsWith('item_')) {
          document.getElementById(targetId).remove();
          const listLen = document.getElementById('listLength');
          if (listLen) listLen.innerHTML = listLen.innerHTML - 1;

        } else if (targetId.startsWith('result_')) {
          document.getElementById(targetId).outerHTML = data.html;
        }
      }
      document.getElementById('item_panel').innerHTML = '';
      document.getElementById('header_panel').style.display = 'block';
      document.getElementById('table_container').style.display = 'block';
    } else {
      showToast('setItemActive: ' + data.message, 'warning');
    }
  } catch (error) {
    showToast('setItemActive Fehler: ' + error.message, 'warning');
  }
}

async function deleteItem(itemId, searchString, targetId, event) {
  if (event) event.stopPropagation();

  if (confirm(`Der Listeneintrag für "${searchString}" wird endgültig gelöscht.`)) {
    try {
      const result = await fetch('/del', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
        body: `{ "itemId": "${itemId}", "targetId": "${targetId}" }`
      });

      const data = await result.json();
      if (result.ok) {
        if (targetId && document.getElementById(targetId)) {
          if (targetId.startsWith('item_')) {
            document.getElementById(targetId).remove();
            const listLen = document.getElementById('listLength');
            if (listLen) listLen.innerHTML = listLen.innerHTML - 1;

          } else if (targetId.startsWith('result_')) {
            document.getElementById(targetId).outerHTML = data.html;
          }
        }
        document.getElementById('item_panel').innerHTML = '';
        document.getElementById('header_panel').style.display = 'block';
        document.getElementById('table_container').style.display = 'block';
      } else {
        showToast('deleteItem: ' + data.message, 'warning');
      }
    } catch (error) {
      showToast('deleteItem Fehler: ' + error.message, 'warning');
    }
  }
}

//******************************************************************
//*********** Container-Actions ************************************
//******************************************************************

function toggleTab(tabId, force) {
  const tab = document.getElementById(tabId);

  let showTab = force;
  if (!showTab) {
    showTab = (tabId && tab.style.display !== 'block');
  }

  //message ausblenden
  tab && tab.querySelectorAll('.statusmsg').forEach(e => { if (e.style.display !== 'none') e.style.display = 'none' });

  // Tab-Content ausblenden
  document.querySelectorAll('#header_panel .tab-content').forEach(tab => {
    if (tab.style.display !== 'none') tab.style.display = 'none';
  });

  if (tabId) document.getElementById(tabId).style.display = (showTab) ? 'block' : 'none';

  if (showTab) {
    //Online-Suche anzeigen
    if (CUR_ITEM !== undefined) {
      const item = CUR_ITEM;
      document.getElementById('fullSearchString').value = item.searchString;
      document.getElementById("mediaType").value = item.mediaType;
      document.getElementById("extendedMode").value = false;

      /* const kennungen = (item.kennungen) ? item.kennungen : [item.kennung];
      setKennungen(kennungen); */

      document.getElementById('targetDate').value = item.targetDate;
      //document.getElementById("app").scrollIntoView({ block: 'start' });
    }
    closeItemMenu();
  }
  else {
    //item anzeigen:
    if (CUR_ITEM !== undefined) openItemMenu(CUR_ITEM, TARGET_ID);
    reloadList();
  }

  /*   const fullSearchString = document.getElementById('fullSearchString');
    if (fullSearchString) fullSearchString.focus(); */
}

function openSearchTab(item, enableReturn) {

  const tabId = 'searchTab';
  toggleTab(tabId, 'block');

  document.getElementById('fullSearchString').value = item.searchString;
  document.getElementById("mediaType").value = item.mediaType;
  document.getElementById("extendedMode").value = false;

  if (enableReturn) {
    resetKennungen()
    document.getElementById('backToMenuItem').disabled = false;
  } else {
    const kennungen = (item.kennungen) ? item.kennungen : [item.kennung];
    setKennungen(kennungen);
  }

  document.getElementById('targetDate').value = item.targetDate;

  document.getElementById("header_panel").style.display = 'block';
  document.getElementById("item_panel").style.display = 'none';
  document.getElementById("app").scrollIntoView({ block: 'start' });
}

function backToMenuItem() {
  const button = document.getElementById('onlSearchButton')
  const tabId = 'searchTab';
  toggleTab(tabId);

  document.getElementById("header_panel").style.display = 'none';
  document.getElementById("item_panel").style.display = 'block';
  document.getElementById("app").scrollIntoView({ block: 'start' });
}

function newSearchTab() {
  document.getElementById('fullSearchString').value = '';
  document.getElementById("mediaType").value = 'eBook';
  document.getElementById("extendedMode").value = false;
  document.getElementById("targetDate").value = '';
  resetKennungen();
}


//**************** Online-Query

async function importQueryData() {
  try {
    const statusmsg = document.querySelector('#importQueryData  .statusmsg');
    statusmsg.style.display = 'block';
    insertTextWithSpinner(statusmsg, "Online-Abfrage gestartet ... ");

    let kennung;
    document.querySelectorAll('input[name="kennung"]').forEach(radio => {
      if (radio.checked) kennung = radio.value
    })
    let count;
    document.querySelectorAll('input[name="count"]').forEach(radio => {
      if (radio.checked) count = radio.value
    })

    const result = await fetch('/imp/html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ kennung, count })
    });

    const data = await result.json();
    if (result.ok) {
      statusmsg.textContent = data.message;
      RELOAD_NEEDED = true;

    } else {
      statusmsg.textContent = "";
      statusmsg.style.display = 'none';
      showToast('importQueryData: ' + data.message, 'warning');
    }

  } catch (error) {
    showToast(statusText.textContent = 'importQueryData: ' + error.message, 'warning');
  }
}

//**************** FileImport

function fileImportEventListener() {
  document.getElementById('uploadForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const fileInput = document.getElementById('searchlistFile');
    const formData = new FormData();
    formData.append('searchlistFile', fileInput.files[0]);
    const statusmsg = document.querySelector('#fileImport .statusmsg');
    statusmsg.style.display = 'block';
    insertTextWithSpinner(statusmsg, "Datei-Import gestartet ... ");

    try {

      const result = await fetch('/upl/htlm', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}` },
        body: formData
      });

      const data = await result.json();
      if (result.ok) {
        statusmsg.textContent = data.message;
      } else {
        showToast('fileImportEventListener: ' + data.message, 'warning');
        statusmsg.textContent = "";
        statusmsg.style.display = 'none';
      }
    } catch (error) {
      showToast('fileImportEventListener: Fehler: ' + error.message, 'warning');
    }
  })
}


function jsonImportEventListener() {
  document.getElementById('jsonUploadForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const fileInput = document.getElementById('jsonlistFile');
    const formData = new FormData();
    formData.append('jsonlistFile', fileInput.files[0]);

    const curTab = document.getElementById('importJsonData');
    let kennung;
    curTab.querySelectorAll('input[name="kennung"]').forEach(radio => {
      if (radio.checked) kennung = radio.value
    })
    if (!kennung) {
      alert("Bitte die Bibliothek auswählen.");
      return;
    } 
    formData.append('kennung', kennung);

    const statusmsg = document.querySelector('#importJsonData .statusmsg');
    statusmsg.style.display = 'block';
    insertTextWithSpinner(statusmsg, "Datei-Import gestartet ... ");

    try {

      const result = await fetch('/upl/json', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}` },
        body: formData
      });

      const data = await result.json();
      if (result.ok) {
        statusmsg.textContent = data.message;
      } else {
        showToast('fileImportEventListener: ' + data.message, 'warning');
        statusmsg.textContent = "";
        statusmsg.style.display = 'none';
      }
    } catch (error) {
      showToast('fileImportEventListener: Fehler: ' + error.message, 'warning');
    }
  })
}


//**************** Check - Merkliste prüfen 
async function bulkUpdate() {
  const days = document.getElementById('daysInput').value;

  const statusmsg = document.querySelector('#bulkUpdate  .statusmsg');
  statusmsg.style.display = 'block';
  insertTextWithSpinner(statusmsg, "Aktualisieren gestartet ... ");

  try {
    const result = await fetch('/upd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ days: parseInt(days) })
    });

    const data = await result.json();

    if (result.ok) {
      statusmsg.textContent = `${data.availCount} von ${data.checkedCount} Einträgen verfügbar.`;
      reloadList();

    } else {
      statusmsg.textContent = "";
      statusmsg.style.display = 'none';
      showToast('bulkUpdate: ' + data.message, 'warning');

    }
  } catch (error) {
    showToast('bulkUpdate Fehler: ' + error.message, 'warning');
  }
}

//****************  Check - Überflüssige Einträge löschen
async function bulkClearance() {
  const statusmsg = document.querySelector('#bulkClearance  .statusmsg');
  statusmsg.style.display = 'block';
  insertTextWithSpinner(statusmsg, "Aufräumen gestartet ... ");

  try {
    const result = await fetch('/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` }
    });

    const data = await result.json();
    if (result.ok) {
      statusmsg.textContent = data.message;
      RELOAD_NEEDED = true;
    } else {
      statusmsg.textContent = "";
      statusmsg.style.display = 'none';
      showToast('bulkUpdate: ' + data.message, 'warning');
    }

  } catch (error) {
    showToast('bulkUpdate Fehler: ' + error.message, 'warning');
  }
}

//********************** Suche
function setKennungen(kennungen) {
  const checkboxes = document.querySelectorAll('#search_kennung .btn-check');
  checkboxes.forEach(checkbox => {
    checkbox.checked = (kennungen.indexOf(checkbox.value) === -1);
  });
}

function resetKennungen() {
  const checkboxes = document.querySelectorAll('#search_kennung .btn-check');
  checkboxes.forEach(checkbox => { checkbox.checked = false });
}

function getKennungen() {
  const checkboxes = document.querySelectorAll('#search_kennung .btn-check');
  const kennungen = [];
  checkboxes.forEach(checkbox => {
    if (!checkbox.checked) {
      kennungen.push(checkbox.value);
    }
  });
  return kennungen;
}

async function fullSearch() { //Suche
  const searchString = document.getElementById('fullSearchString').value.trim();
  if (!searchString) {
    showToast('Bitte einen Suchstring eingeben', 'info');
    return;
  }

  const mediaType = document.getElementById('mediaType').value;
  const extendedMode = document.getElementById('extendedMode').checked;
  const kennungen = getKennungen();
  kennungen.push('CASSIS');  //auch CASSIS einfügen

  try {
    //const statusmsg = document.querySelector('#searchTab  .statusmsg');
    const statusmsg = document.querySelector('#itemlist_panel .statusmsg');
    statusmsg.style.display = 'block';
    insertTextWithSpinner(statusmsg, "Online-Suche gestartet ... ");

    const result = await fetch('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ searchString, mediaType, extendedMode, kennungen })
    });

    statusmsg.style.display = 'none';
    statusmsg.textContent = '';

    const data = await result.json();
    if (result.ok) {
      closeTableContainer();
      document.getElementById('table_container').innerHTML = data.html;

      filterTable(FILTER_TEXT, FILTER_PRIO, FILTER_RESERV);

      document.getElementById('table_container').scrollIntoView({ block: 'start' });

    } else {
      showToast('fullSearch: ' + data.message, 'warning');
    }

  } catch (error) {
    showToast('fullSearch Fehler: ' + error.message, 'warning');
  }
}

function toggleCassis() {
  const tableId = "resultlist"
  const statusValue = '^';
  const table = document.getElementById(tableId);
  if (table) {
    const rows = table.querySelectorAll(`.itemrow:has(td.statusCell[value="${statusValue}"])`)
    if (rows && rows.length > 0) {
      const display = rows[0].style.display === 'none' ? '' : 'none';
      rows.forEach(row => { row.style.display = display; });
    } else console.log('no item rows')
  } else console.log('no result table')
}

async function saveSearchItem() {

  const statusmsg = document.querySelector('#itemlist_panel  .statusmsg');
  statusmsg.style.display = 'block';
  insertTextWithSpinner(statusmsg, "Warteliste aktualisieren ... ");

  const searchString = document.getElementById('fullSearchString').value.trim();
  if (!searchString) {
    showToast('Bitte den Suchstring eingeben', 'info');
    return;
  }
  const mediaType = document.getElementById('mediaType').value;
  const extendedMode = document.getElementById('extendedMode').checked;
  const kennungen = getKennungen();
  const targetDate = document.getElementById('targetDate').value;
  if (!targetDate) {
    showToast('Bitte den Abruftermin einstellen', 'info');
    return;
  }
  try {
    const result = await fetch('/waitlist/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ searchString, mediaType, extendedMode, kennungen, targetDate })
    });

    const data = await result.json();
    if (result.ok) {
      document.getElementById('table_container').innerHTML = data.html;

      filterTable(FILTER_TEXT, FILTER_PRIO, FILTER_RESERV);

      document.getElementById('itemlist_panel').scrollIntoView({ block: 'start' });
      setTimeout(() => statusmsg.style.display = 'none', 300);
    } else {
      showToast('saveSearchItem: ' + data.message, 'warning');
    }

  } catch (error) {
    showToast('saveSearchItem Fehler: ' + error.message, 'warning');
  }
}


async function getWaitlist(sort = 'targetDate', dir = 'asc') {
  try {
    const statusmsg = document.querySelector('#itemlist_panel  .statusmsg');
    statusmsg.style.display = 'block';
    insertTextWithSpinner(statusmsg, "Warteliste abrufen ... ");

    const result = await fetch('/waitlist/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ field: sort, direction: dir })
    });

    const data = await result.json();
    if (result.ok) {
      document.getElementById('table_container').innerHTML = data.html;

      filterTable(FILTER_TEXT);

      document.getElementById('itemlist_panel').scrollIntoView({ block: 'start' });
      document.querySelector('#listButtons .active')?.classList.remove('active');
      document.getElementById('waitlist').classList.add('active')

    } else {
      showToast('getWaitlist: ' + data.message, 'warning');
    }

    document.getElementById('searchInput').value = FILTER_TEXT;
    document.getElementById('prioInput').checked = FILTER_PRIO;
    document.getElementById('reservInput').checked = FILTER_RESERV;
    loadSearchModal();
    setTimeout(() => statusmsg.style.display = 'none', 300);

  } catch (error) {
    showToast('getWaitlist Fehler: ' + error.message, 'warning');
  }
}

async function updateWaitlist(sort = 'targetDate', dir = 'asc') {
  const statusmsg = document.querySelector('#itemlist_panel  .statusmsg');
  statusmsg.style.display = 'block';
  insertTextWithSpinner(statusmsg, "Warteliste wird aktualisiert ... ");

  try {
    const result = await fetch('/waitList/upd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ field: sort, direction: dir })
    });

    const data = await result.json();
    if (result.ok) {
      document.getElementById('table_container').innerHTML = data.html;

      filterTable(FILTER_TEXT, FILTER_PRIO, FILTER_RESERV);

      document.getElementById('itemlist_panel').scrollIntoView({ block: 'start' });
    } else {
      showToast('updateWaitlist: ' + data.message, 'warning');
    }

    document.getElementById('searchInput').value = FILTER_TEXT;
    document.getElementById('prioInput').checked = FILTER_PRIO;
    document.getElementById('reservInput').checked = FILTER_RESERV;
    loadSearchModal();
    setTimeout(() => statusmsg.style.display = 'none', 300);

  } catch (error) {
    showToast('updateWaitlist Fehler: ' + error.message, 'warning');
  }
}

function closeTableContainer() {
  document.getElementById('table_container').innerHTML = '';
  document.querySelector('#listButtons .active')?.classList.remove('active');

  document.body.scrollTop = 0; // For Safari
  document.documentElement.scrollTop = 0; // For Chrome, Firefox, IE and Opera
}

async function openSearchMenu(item) {
  gotoSuche(item)
  document.getElementById("targetDate").value = item.targetDate;
  document.getElementById('extendedMode').value = item.extendedMode;
  setKennungen(item.kennungen);
}

async function deleteSearchItem(itemId, searchString, targetId, event) {
  if (event) event.stopPropagation();

  if (confirm(`Bestätige die Löschung für "${searchString}"`)) {
    try {
      const result = await fetch('/waitlist/del', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
        body: `{ "itemId": "${itemId}"}`
      });

      if (result.ok) {
        document.getElementById(targetId).remove();
        const listLen = document.getElementById('waitlistLength');
        if (listLen) listLen.innerHTML = listLen.innerHTML - 1;
      } else {
        const data = await result.json();
        showToast('deleteSearchItem: ' + data.message, 'warning');
      }
    } catch (error) {
      showToast('deleteSearchItem Fehler: ' + error.message, 'warning');
    }
  }
}

//********************** Backup
document.addEventListener('DOMContentLoaded', async () => {
  // Bootstrap-Tooltips aktivieren
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(el => new bootstrap.Tooltip(el));
  // Backups laden
  await loadBackups();
  // Backup erstellen Button
  document.getElementById('createBackupBtn').addEventListener('click', createBackup);
});

async function createBackup() {  //Backup - Neues Backup erstellen
  const btn = document.getElementById('createBackupBtn');
  const statusmsg = document.querySelector('#createBackup  .statusmsg');
  statusmsg.style.display = 'block';
  insertTextWithSpinner(statusmsg, "Backup gestartet ... ");

  await new Promise(resolve => setTimeout(resolve, 1000));
  try {
    btn.disabled = true;

    const result = await fetch('/api/backups', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
    });
    const data = await result.json();

    if (data.success) {
      await loadBackups();
      statusmsg.textContent = 'Backup erfolgreich erstellt';

    } else {
      throw new Error(data.message || 'Backup fehlgeschlagen');
    }
  } catch (error) {
    console.error('Backup error:', error);
    showToast(`Fehler: ${error.message}`, 'danger');
  } finally {
    btn.disabled = false;
  }
}

function openAdminBackups() {
  const body = document.querySelector('#adminBackups  .card-body');
  body.style.display = (body.style.display == 'none') ? "block" : "none"
}

function toggleCardBody(element) {
  const cardBody = element.nextSibling;
  cardBody.style.display = (cardBody.style.display == 'none') ? "block" : "none"
  const cardFooter = cardBody.nextSibling;
  if (cardFooter) cardFooter.style.display = 'none';
}

async function loadBackups() {  //Backup Laden beim öffnen
  try {
    const result = await fetch('/api/backups', { headers: { 'Authorization': `Bearer ${TOKEN}` } });
    const { backups } = await result.json();

    const backupList = document.getElementById('backupList');
    backupList.innerHTML = '';

    if (backups.length === 0) {
      backupList.innerHTML = `
          <tr>
            <td colspan="4" class="text-center">Keine Backups vorhanden</td>
          </tr>
        `;
      return;
    }

    backups.forEach(backup => {
      const row = document.createElement('tr');
      row.innerHTML = `
          <td>${backup.name}</td>
          <td>${formatFileSize(backup.size)}</td>
          <td>${new Date(backup.date).toLocaleString()}</td>
          <td>
            <div class="btn-group btn-group-md">
              <button class="btn btn-outline-primary restore-btn" 
                      data-bs-toggle="tooltip" 
                      title="Wiederherstellen"
                      data-backup="${backup.name}">
                <i class="bi bi-arrow-counterclockwise"></i>
              </button>
              <button class="btn btn-outline-danger delete-btn" 
                      data-bs-toggle="tooltip" 
                      title="Löschen"
                      data-backup="${backup.name}">
                <i class="bi bi-trash"></i>
              </button>
              <button class="btn btn-outline-secondary download-btn" 
                      data-bs-toggle="tooltip" 
                      title="Herunterladen"
                      data-backup="${backup.name}">
                <i class="bi bi-download"></i>
              </button>
            </div>
          </td>
        `;
      backupList.appendChild(row);
    });

    // Event Listener für Buttons hinzufügen
    document.querySelectorAll('.restore-btn').forEach(btn => {
      btn.addEventListener('click', () => showRestoreModal(btn.dataset.backup));
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteBackup(btn.dataset.backup));
    });

    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', () => downloadBackup(btn.dataset.backup));
    });

  } catch (error) {
    document.getElementById('backupList').innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-danger">Fehler beim Laden: ${error.message}</td>
        </tr>
      `;
    console.error('Backup loading error:', error);
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showRestoreModal(backupName) { //Backup - Restore Rückfrage
  document.getElementById('restoreBackupName').textContent = backupName;
  const modal = new bootstrap.Modal(document.getElementById('restoreModal'));
  modal.show();

  document.getElementById('confirmRestoreBtn').onclick = async () => {
    modal.hide();
    await restoreBackup(backupName);
  };
}

async function restoreBackup(backupName) { //Backup - Restore
  try {
    const result = await fetch(`/api/backups/${encodeURIComponent(backupName)}/restore`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
    });

    const data = await result.json();

    if (data.success) {
      showToast('Backup erfolgreich wiederhergestellt');
      // Seite neu laden um aktuelle Daten anzuzeigen
      setTimeout(() => reloadList(), 1500);
    } else {
      throw new Error(data.message || 'Wiederherstellung fehlgeschlagen');
    }
  } catch (error) {
    console.error('Restore error:', error);
    showToast(`Fehler: ${error.message}`, 'danger');
  }
}

async function deleteBackup(backupName) { //Backup - Delete
  if (!confirm(`Soll das Backup "${backupName}" wirklich gelöscht werden?`)) {
    return;
  }

  try {
    const result = await fetch(`/api/backups/${encodeURIComponent(backupName)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
    });

    const data = await result.json();

    if (data.success) {
      showToast('Backup erfolgreich gelöscht');
      await loadBackups();
    } else {
      throw new Error(data.message || 'Löschen fehlgeschlagen');
    }
  } catch (error) {
    console.error('Delete error:', error);
    showToast(`Fehler: ${error.message}`, 'warning');
  }
}

function downloadBackup(backupName) { //Backup - Download
  window.open(`/api/backups/${encodeURIComponent(backupName)}/download?token=Bearer%20${TOKEN}`, '_blank');
}

function showToast(message, textBgType = 'primary') {
  const toastContainer = document.createElement('div');
  toastContainer.innerHTML = `
      <div class="toast align-items-center text-bg-${textBgType} border-0 show" role="alert">
        <div class="d-flex">
          <div class="toast-body"><h6>${message}</h6></div>
          <button type="button" class="btn-close  me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>
    `;
  console.log(message);
  document.body.appendChild(toastContainer);
  setTimeout(() => toastContainer.remove(), 3000);
}

function insertTextWithSpinner(element, text) {
  element.innerHTML = text + `<i class="bi bi-arrow-repeat spin-animation"></i>`
}

function formatDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
};

function toClipboard(itemId, feedbackId) {
  copyToClipboard(document.getElementById(itemId).value, document.getElementById(feedbackId));
}

const copyToClipboard = async (text, feedbackElement) => {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback für ältere Safari
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    // Feedback (z. B. Tooltip)
    if (feedbackElement) {
      feedbackElement.textContent = "Kopiert!";
      setTimeout(() => feedbackElement.textContent = '', 2000);
    }
  } catch (err) {
    console.error("Copy failed:", err);
    if (feedbackElement) {
      feedbackElement.textContent = "Fehler!";
    }
  }
};

window.onload = function () {
  TOKEN && getWatchlist('all')
};
