# Il sito di Ordine Rapido

Il sito è una pagina sola, già pronta: non c'è niente da costruire. I file da pubblicare sono nella cartella `public`.

## Pubblicarlo su Render (sito statico)

Nella pagina **Settings** del servizio le caselle vanno compilate così, tutto in minuscolo:

| Casella | Valore |
|---|---|
| Branch | `main` |
| Root Directory | `sito` |
| Build Command | `npm install` |
| Publish Directory | `public` |

`npm install` è il comando che Render propone da solo: qui non installa niente, perché il `package.json` di questa cartella non ha dipendenze. Dopo aver salvato: **Manual Deploy → Deploy latest commit**.

Da quel momento Render ripubblica il sito da solo a ogni modifica di questa cartella.
