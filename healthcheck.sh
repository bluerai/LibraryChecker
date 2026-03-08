

exitcode1=1

# Prüfen, ob HTTPS_PORT gesetzt ist und größer als 0
if [ -n "${HTTPS_PORT}" ] && [ "${HTTPS_PORT}" -gt 0 ]; then
  curl -k https://localhost:${HTTPS_PORT}/api/health/
  exitcode1=$? 
fi

exitcode2=1

# Prüfen, ob HTTP_PORT gesetzt ist und größer als 0
if [ -n "${HTTP_PORT}" ] && [ "${HTTP_PORT}" -gt 0 ]; then
  curl http://localhost:${HTTP_PORT}/api/health/
  exitcode2=$? 
fi

# Prüfen, ob mindestens eine der Anfragen erfolgreich war
if [ "$exitcode1" -eq 0 ] || [ "$exitcode2" -eq 0 ]; then
    exit 0  # Erfolg
else
    # Fehler, wenn ein Zugriff fehlschlägt
    exit 1 
fi