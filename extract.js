(async function () {

  const TARGET_COUNT = 200;  // Anzahl der Bücher, die extrahiert werden sollen
  const SCROLL_DELAY = 600;  // ms zwischen Scrolls

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Scroll-Container ermitteln
  function getScrollElement() {
    let el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    while (el) {
      if (el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return document.scrollingElement;
  }

  const scrollElement = getScrollElement();

  const DOMAIN = location.hostname.replace(/\.de$/, "");
  const TIMESTAMP = new Date().toISOString().replace("T", "_").replace(/:/g, "-").replace(/\..+/, "");
  const FILENAME = `${DOMAIN}.neuaufnahmen_${TIMESTAMP}.json`;

  const results = new Set();
  let fileContent = "";

  function downloadFile() {
    const blob = new Blob([fileContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    let a = document.getElementById("onleihe-export");
    if (!a) {
      a = document.createElement("a");
      a.id = "onleihe-export";
      a.style.position = "fixed";
      a.style.top = "10px";
      a.style.right = "10px";
      a.style.zIndex = 9999;
      a.style.background = "green";
      a.style.color = "white";
      a.style.padding = "10px";
      a.textContent = "Download JSON";
      document.body.appendChild(a);
    }

    a.href = url;
    a.download = FILENAME;
  }

  function extractVisible() {
    const cards = document.querySelectorAll('div[data-testid^="mediaWidgetCard-"]');

    cards.forEach(card => {

      // MediaId extrahieren
      const mediaIdMatch = card.getAttribute("data-testid").match(/^mediaWidgetCard-(.+)$/);
      if (!mediaIdMatch) return;
      const mediaId = mediaIdMatch[1];

      // das aria-label-div nur 1x pro Card
      const ariaDiv = card.querySelector('div[aria-label]');
      if (!ariaDiv) return;

      const aria = ariaDiv.getAttribute("aria-label");
      if (!aria) return;

      const parts = aria.split("|").map(p => p.trim());
      const typ = parts[0] || "";
      const titel = parts[1] || "";
      let autor = "";
      for (const part of parts) {
        if (part.startsWith("von ")) {
          autor = part.replace(/^von\s+/, "").trim();
          break;
        }
      }

      // Datum extrahieren
      let datum = "";
      const text = card.innerText;
      const dateMatch = text.match(/vsl\.\s*ab\s*:\s*(\d{2}\.\d{2}\.\d{4})/);
      if (dateMatch) datum = dateMatch[1];

      // Verhindert Duplikate
      const key = mediaId;
      if (results.has(key)) return;
      results.add(key);

      const obj = { typ, titel, autor, datum, mediaId };
      fileContent += JSON.stringify(obj) + "\n";

      downloadFile();
      console.log("Gespeichert:", obj);
    });
  }

  while (results.size < TARGET_COUNT) {
    extractVisible();
    console.log("Gesamt gesammelte Bücher:", results.size);

    scrollElement.scrollTop += scrollElement.clientHeight;
    await sleep(SCROLL_DELAY);
  }

  console.log("Fertig. Exportiert:", results.size);

})();