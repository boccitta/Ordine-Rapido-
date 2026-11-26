# Sviluppo

Come è fatta l'app e come lavorarci.

## Com'è fatta

L'app è una pagina: HTML, CSS e JavaScript scritti a mano, senza framework e senza fase di compilazione. Per provarla basta aprire `app/index.html` nel browser.

| File | Compito |
|---|---|
| `app/index.html` | Struttura della pagina e regola di sicurezza (Content Security Policy) |
| `app/style.css` | Aspetto, tema chiaro e scuro |
| `app/core.js` | **Logica pura**: numeri, calcoli, controlli, abbinamento con l'archivio, costruzione del CSV, copia di sicurezza. Non tocca la pagina e si prova con Node |
| `app/app.js` | Interfaccia: schermate, lettura dei file, chiamata ad Anthropic, salvataggio degli archivi |
| `app/versione.js` | Versione e indirizzo del codice sorgente. **Generato**: non si modifica a mano |
| `app/vendor/` | Librerie e caratteri di terzi, con licenze e impronte in `VENDOR.json` |
| `desktop/main.js` | La finestra dell'app desktop (Electron): apre `app/index.html` e blocca tutto il resto |

La regola che dà senso al progetto, **nel file finiscono solo codici dell'archivio**, vive in `core.js` (`matchRow`, `buildTable`, `unlinked`) e nel blocco dell'esportazione di `app.js` (`guard`). Chi tocca queste parti deve far passare le prove che la difendono.

### Due modi di funzionare

`app.js` controlla se esiste `window.claude`:

- **da sola** (il caso normale): lettura con la chiave API dell'utente, archivi in IndexedDB, download normale del browser;
- **dentro Claude**, pubblicata come pagina: lettura e salvataggio passano per le funzioni offerte dalla pagina.

L'oggetto `directReader` imita la forma di quello offerto da Claude (`json()`, `limits()`), così il resto del codice non distingue i due casi.

### Dove sono salvati i dati

| Dato | Dove | Chiave |
|---|---|---|
| Archivi e abbinamenti | IndexedDB, database `ordine-rapido`, contenitore `archivi` | `art`, `cli`, `man`, `alias` |
| Tracciato | localStorage | `ordine-rapido-tracciato` |
| Chiave API, modello | localStorage | `ordine-rapido-lettura` |
| Tema, colonne visibili | localStorage | `ordine-rapido-ui` |

Cambiare questi nomi o la forma dei dati salvati fa perdere gli archivi a chi aggiorna: è una modifica da versione MAGGIORE e va accompagnata da una lettura dei dati vecchi.

## Comandi

```bash
npm test                 # 21 prove su logica e progetto + controllo dei dati. Non richiede installazioni
npm run controlla-dati   # solo il controllo che cerca dati reali e credenziali
npm run versione         # allinea app/versione.js a package.json e controlla il registro
npm run costruisci       # crea dist/Ordine-Rapido.html, l'app in un solo file

npm ci                   # installa Electron ed electron-builder
npm start                # avvia l'app desktop dal codice
npm run pacchetti        # costruisce in dist/ il pacchetto per il sistema su cui ti trovi
```

### Prove nel browser e come app desktop

Usano [Playwright](https://playwright.dev/), che non è tra le dipendenze del progetto per non appesantire l'installazione.

```bash
npm install --no-save playwright
npx playwright install chromium

node test/e2e.js                             # app aperta da file
node test/e2e.js dist/Ordine-Rapido.html     # versione in un solo file
node test/desktop.js                         # app desktop dal codice
node test/desktop.js dist/linux-unpacked/ordine-rapido   # app desktop impacchettata
```

Su Linux senza schermo, davanti alle prove dell'app desktop va messo `xvfb-run -a`.

Il servizio di Anthropic è simulato da `test/simulazione.js`: le prove non hanno bisogno di una chiave e non mandano nulla su internet. Controllano tra l'altro che nessuna richiesta parta verso altri siti e che gli archivi non vengano inviati con la lettura.

## Regole per il codice

- **Nessun dato reale**, nemmeno nei commenti o nelle prove. Solo i dati di `esempi/` o altri costruiti allo stesso modo.
- **Niente contenuti inseriti come HTML.** Tutto ciò che arriva da un documento o da un archivio passa per `textContent`, attraverso la funzione `el()`.
- **Nessun nuovo indirizzo di rete.** Una prova fallisce se il codice nomina un indirizzo diverso da quello di Anthropic.
- **La logica sta in `core.js`** e ogni comportamento nuovo ha la sua prova in `test/core.test.js`.
- Testi dell'interfaccia in italiano, brevi, con i nomi che l'utente vede.
- Ogni modifica visibile ha la sua voce nel registro: vedi [RILASCI.md](RILASCI.md).

## Librerie di terzi

Sono copiate in `app/vendor/` senza modifiche, non installate a ogni build: così chi scarica la repository ha un'app che funziona e chi la controlla sa esattamente che cosa contiene. `VENDOR.json` registra pacchetto, versione, origine, licenza e impronta SHA-256 di ogni file; `npm test` fallisce se un file non corrisponde.

| File | Pacchetto | Versione |
|---|---|---|
| `pdf.min.js`, `pdf.worker.min.js` | pdfjs-dist | 3.11.174 |
| `xlsx.full.min.js` | xlsx (SheetJS Community Edition) | 0.18.5 |
| `fonts/figtree-*.woff2` | @fontsource-variable/figtree | 5.3.0 |
| `fonts/montserrat-*.woff2` | @fontsource-variable/montserrat | 5.3.0 |

### Aggiornare una libreria

1. Scarica il pacchetto in una cartella temporanea, per esempio con `npm pack pdfjs-dist@VERSIONE`, ed estrai l'archivio.
2. Copia in `app/vendor/` solo i file elencati sopra, più il file della licenza in `app/vendor/licenze/` se è cambiato.
3. Aggiorna versione e origine in `app/vendor/VENDOR.json`, poi esegui `node scripts/registra-vendor.js` per ricalcolare le impronte.
4. Aggiorna [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
5. Esegui tutte le prove, comprese quelle nel browser: leggono un PDF e un file Excel veri.
6. Scrivi la voce nel registro, sotto **Sicurezza** se l'aggiornamento chiude una vulnerabilità.

Due note:

- **pdf.js** dalla versione 4 è distribuito come modulo JavaScript. Passare a quella versione richiede di cambiare il modo in cui la libreria viene caricata, e di riprovare l'app aperta da file.
- **SheetJS** pubblica le versioni successive alla 0.18.5 solo sul proprio sito, `cdn.sheetjs.com`, non sul registro npm. La 0.20.3 corregge le vulnerabilità indicate in [SECURITY.md](../SECURITY.md): l'aggiornamento è il primo lavoro consigliato.

## Pacchetti desktop

La configurazione è nel campo `build` di `package.json`.

- `publish: null`: nessun aggiornamento automatico. L'app non controlla da sola se esistono versioni nuove.
- Mac: `identity: "-"` applica una firma locale senza certificato Apple, necessaria perché l'app parta sui processori Apple; `hardenedRuntime: false` è richiesto da quel tipo di firma.
- `appId` è `it.ordinerapido.app`. Non va cambiato: su Windows e Mac identifica l'app e la sua cartella dei dati.

Per firmare davvero i pacchetti servono un certificato di firma del codice per Windows e l'iscrizione al programma sviluppatori di Apple; vanno aggiunti come segreti della repository e configurati in `electron-builder`.
