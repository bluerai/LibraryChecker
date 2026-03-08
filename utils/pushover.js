'use strict';

import fs from 'fs-extra';
import { logger } from './log.js';
import path from 'path';

const messagingfile = path.join(path.resolve(process.env.CHECKLIB_DATADIR || './data'), 'config', 'pushover.json');

class PushMessage {
  constructor(credentials) {
    this.cred = credentials;
    this.name = "none";
    this.valid = false;
  }

  error(msg) { }
  warn(msg) { }
  info(msg) { }
  note(msg) { }
  syserror(msg) { }
  syswarn(msg) { }
  sysinfo(msg) { }
  sysnote(msg) { }
  _send(msg, title, prio, sound, userKey = "user") { }
}

let Push = new PushMessage({});

if (messagingfile) {
  class Pushover extends PushMessage {
    constructor(credentials) {
      super(credentials);
      this.name = "Pushover";
      this.valid = !!(credentials.url && credentials.user && credentials.admin && credentials.token);
    }

    error(msg, title) {
      if (this.valid) this._send(msg, title || "Fehler", 0, "incoming");
    }

    warn(msg, title) {
      if (this.valid) this._send(msg, title || "Warnung", 0, "none");
    }

    info(msg, title) {
      if (this.valid) this._send(msg, title || "Info", 0, "none");
    }

    note(msg, title) {
      if (this.valid) this._send(msg, title || "Hinweis", -1, "none");
    }

    syserror(msg, title) {
      if (this.valid) this._send(msg, title || "System-Fehler", 0, "incoming", "admin");
    }

    syswarn(msg, title) {
      if (this.valid) this._send(msg, title || "System-Warnung", 0, "classical", "admin");
    }

    sysinfo(msg, title) {
      if (this.valid) this._send(msg, title || "System-Info", 0, "falling", "admin");
    }

    sysnote(msg, title) {
      if (this.valid) this._send(msg, title || "System-Hinweis", -1, "none", "admin");
    }

    async _send(msg, title, prio, sound, userKey = "user") {
      const headers = { "Content-Type": "application/json" };
      const body = JSON.stringify({
        token: this.cred.token,
        user: this.cred[userKey], // Verwende den übergebenen userKey (entweder "user" oder "admin")
        title: title,
        priority: prio,
        sound: sound,
        message: msg,
      });

      try {
        const response = await fetch(this.cred.url, {
          method: "POST",
          headers,
          body,
        });

        if (response.ok) {
          const data = await response.json();
          logger.silly(`Pushover (${userKey}): message successfully sent: ` + JSON.stringify(data));
          logger.debug(`Pushover (${userKey}): message successfully sent. title=${title}, msg=${msg}, sound=${sound})`);
        } else {
          logger.error(`Pushover (${userKey}): ${response.statusText} (#${response.status})`);
        }
      } catch (error) {
        logger.error(error);
      }
    }
  }

  let cred = {};
  try {
    if (await fs.pathExists(messagingfile)) {
      cred = await fs.readJson(messagingfile);
    }
  } catch (error) {
    logger.error(error);
  }

  Push = new Pushover(cred);
  if (!Push.valid) {
    Push = new PushMessage({});
  }
}

logger.info("Messaging by " + Push.name);
export const push = Push;
