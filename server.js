import express from 'express';
import https from 'https';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import os from 'os';
import * as model from './app/model.js';
import router from './app/router.js';
import backupRouter from './backup/router.js';
import log from './utils/log.js';
import { verifyAction, loginAction, protect } from './auth/index.js';

const app = express();

const HTTP_PORT = parseInt(process.env.HTTP_PORT) || 80;
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT) || 443;
const KEYFILE = process.env.CHECKLIB_KEYFILE || 'key.pem';
const CERTFILE = process.env.CHECKLIB_CERTFILE || 'cert.pem';

// Konfiguration
app.set('view engine', 'pug');


app.set('views', path.join(path.resolve(), 'app', 'views'));
app.use(express.static(path.join(path.resolve(), 'public')));
app.use('/icons', express.static(path.join(path.resolve(), 'node_modules/bootstrap-icons/font')));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.locals.formatDate = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).replace(',', '');
};

app.locals.daysFromToday = (date) => {
  return Math.floor((new Date - new Date(date)) / 24 / 60 / 60 / 1000);
};

// Datenbankverbindung
model.connect().catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});

try {
  const host = process.env.CASSIS_HOST;
  if (!host) {
    throw new Error(`Enviroment variable CASSIS_HOST not set.`)
  }
  const result = await fetch(`http://${host}/api/health`); //{"healthy":true}
  const data = await result.json();
  if (data.healthy)
    log(`Cassis host ${host} found & working correctly.`);
  else
    throw new Error(`Cassis-Server not healthy.`)
} catch (error) {
  console.error(`Error accessing Cassis host at ${process.env.CASSIS_HOST}.`);
  process.exit(1);
}

app.use(morgan('common', {
  immediate: true,
  skip: (req, res) => req.url.startsWith('/app/cover')
}));
/* 'tiny': Gibt minimale Informationen aus(z.B.GET / 200 10 - 1.234 ms).
'combined': Gibt detaillierte Informationen im Apache - Combined - Format aus.
'common': Gibt Informationen im Apache - Common - Format aus.
'dev': Farbige Ausgabe für die Entwicklung(Statuscodes werden farblich hervorgehoben).
'short': Kürzere Ausgabe als 'common'. */

// Routen
app.get('/verify', verifyAction);
app.post('/login', loginAction);
app.get('/api/health', healthAction);
app.use('/api/backups', protect, backupRouter);
app.use('/', protect, router);


log.info('cron-Jobs starten');


if (HTTPS_PORT >= 0) {
  const keyfile = path.join(process.env.DATADIR, 'config', KEYFILE);
  const certfile = path.join(process.env.DATADIR, 'config', CERTFILE);
  if (fs.existsSync(keyfile) && fs.existsSync(certfile)) {

    //key + Cert vorhanden, also https, 
    const options = {
      key: fs.readFileSync(keyfile),
      cert: fs.readFileSync(certfile),
    };
    https.createServer(options, app).listen(HTTPS_PORT, () => {
      log(`Https-Server is listening to https://${getLocalIp()}:${HTTPS_PORT}`)
    });
  }
}

if (HTTP_PORT >= 0) {
  app.listen(HTTP_PORT, () => {
    log(`Http-Server is listening to http://${getLocalIp()}:${HTTP_PORT}`)
  })
}


//==== Helper ================================================================

const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1'; // Fallback auf localhost
};


async function healthAction(request, response) {
  try {
    //log.debug("healthAction");
    const count = await model.countItems();

    log.debug("healthAction: " + request.protocol + "-Server still healthy!");
    response.json({ healthy: true, count });
  }
  catch (error) {
    const message = "CheckLib: Error on " + request.protocol + "-Server: " + error.message;
    log.error(message);
    if (error.stack) log.debug(error.stack);
    if (response) {
      response.json({ healthy: false, error: error.message });
    }
  }
}
