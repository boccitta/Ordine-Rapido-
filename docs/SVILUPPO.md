# Sviluppo

Come è fatta l'app e come lavorarci.

## Com'è fatta

Il codice è scritto in **TypeScript**, nella cartella `src/`, diviso in moduli con compiti separati. Uno script lo compila nei tre file JavaScript che l'app esegue. Pagina e stile (`app/index.html`, `app/style.css`) restano scritti a mano, senza framework.

| Cartella | Compito | Può usare |
|---|---|---|
| `src/core/` | **Logica pura**: numeri, calcoli, controlli, abbinamento con l'archivio, tracciato e costruzione del file, modello del gestionale, copia di sicurezza | solo se stessa |
| `src/core/lettura/` | **Lettura sul dispositivo**, sempre logica pura: da righe di testo con la posizione di ogni pezzo (`testo.ts`) a tabelle d'ordine (`tabella.ts`), righe scritte a parole (`libera.ts`), testata e totali (`testata.ts`). Restituisce la stessa forma che restituisce Claude, così il resto dell'app non distingue chi ha letto | `core` |
| `src/ocr/` | Il motore che riconosce i caratteri nelle foto: gira in un worker e non fa parte di `app.js` | `ppu-paddle-ocr`, `onnxruntime-web` |
| `src/ia/` | Colloquio con i tre servizi di intelligenza artificiale: `anthropic.ts` (Claude, API Messages), `gemini.ts` (Gemini, generateContent), `openai.ts` (GPT, API Responses), con `comune.ts` per errori e richieste e `indice.ts` con l'elenco dei servizi e dei loro indirizzi. Non spedisce nulla: riceve da fuori la funzione che lo fa | `core` |
| `src/piattaforma/` | Gli **ambienti** in cui gira la pagina (browser, app desktop, dentro Claude) dietro un unico contratto: archivi, chiavi API, lettura, salvataggio dei file | `core`, `ia`, il contratto del ponte |
| `src/ui/` | Interfaccia: schermate, righe, archivio, lettura dei file, esportazione, impostazioni, ordine in corso salvato, avviso per gli errori imprevisti | tutto il precedente |
| `src/desktop/` | App desktop: processo principale (`main.ts`), ponte con la finestra (`preload.ts`, `contratto.ts`), custodia delle chiavi (`chiave.ts`), archivi su disco (`archivi.ts`) | `core`, `ia`, Electron, Node |

Una prova (`test/progetto.test.mjs`) fa rispettare la colonna «Può usare»: se la logica importa qualcosa dell'interfaccia, o la pagina importa Electron, `npm test` fallisce.

I moduli della logica:

| File | Contenuto |
|---|---|
| `tipi.ts` | I dati: ordine, riga, archivio, tracciato, errore con codice |
| `numeri.ts` | Lettura e scrittura di numeri e date |
| `ordine.ts` | Netto e totale di riga, totali, controlli mostrati in «Controlla» |
| `anagrafiche.ts` | File esportati dal gestionale, normalizzazione di codici e nomi, forma compatta degli archivi |
| `abbinamento.ts` | Indice degli articoli, collegamento di una riga, ricerca, cliente e mandante |
| `tracciato.ts` | Colonne esportabili, tracciato, tabella e testo del file, codifica Windows |
| `risposta.ts` | Dal testo del modello ai dati |
| `copia.ts` | Copia di sicurezza |
| `indice.ts` | L'elenco di quello che la logica offre al resto dell'app |

La regola che dà senso al progetto, **nel file finiscono solo codici dell'archivio**, vive in `src/core/abbinamento.ts` (`matchRow`), `src/core/tracciato.ts` (`buildTable`), `src/core/ordine.ts` (`unlinked`) e in `src/ui/esporta.ts` (`guard`). Chi tocca queste parti deve far passare le prove che la difendono.

### File generati

`npm run compila` (`scripts/compila.js`, con [esbuild](https://esbuild.github.io/)) produce:

| File | Da | Che cos'è |
|---|---|---|
| `app/app.js` | `src/ui/avvio.ts` | Tutto il codice della pagina in un file solo, caricato da un normale `<script>`: funziona anche aperto da disco |
| `desktop/main.js` | `src/desktop/main.ts` | Il processo principale dell'app desktop |
| `desktop/preload.js` | `src/desktop/preload.ts` | Il ponte, lato finestra |
| `app/vendor/ocr/ocr-dati.js` | `src/ocr/motore.ts`, `node_modules/onnxruntime-web`, `terzi/ocr/` | Motore, WebAssembly e modelli per leggere le foto, in base64 dentro un solo script di circa 28 MB: una pagina aperta da disco non può leggere altri file, ma può caricare uno script. Si rifà solo quando cambia un ingrediente. Dettagli in [`terzi/ocr/LEGGIMI.md`](../terzi/ocr/LEGGIMI.md) |

Non stanno nella repository e non si modificano a mano. Il codice non viene compresso: chi vuole controllarlo lo può leggere. La versione e l'indirizzo del codice sorgente vengono scritti dentro `app/app.js` in questo momento, a partire da `package.json`.

Per provare la pagina in un browser: `npm run compila`, poi apri `app/index.html`.

### Tre ambienti, un contratto

`src/piattaforma/indice.ts` sceglie l'ambiente all'avvio; il resto del codice usa solo il contratto di `src/piattaforma/tipi.ts` e non sa dove si trova.

| | Browser (`browser.ts`) | App desktop (`desktop.ts`) | Dentro Claude (`claude.ts`) |
|---|---|---|---|
| Si riconosce da | nessuno dei due seguenti | `window.ordineRapido`, il ponte | `window.claude` |
| Archivi | IndexedDB | file nella cartella dati dell'app | spazio privato della pagina |
| Chiave API | memoria locale della pagina, in chiaro | processo principale, cifrata dal sistema operativo | non serve |
| Chi parla con il servizio scelto | la pagina | il processo principale | Claude (solo Claude) |
| Salvataggio dei file | download del browser | finestra «Salva con nome» | funzione offerta dalla pagina |

### L'app desktop

La finestra carica `app/index.html` isolata (`contextIsolation`, `sandbox`, niente Node) e riceve solo il ponte descritto in `src/desktop/contratto.ts`: è l'elenco completo di quello che la pagina può chiedere.

- **Chiave API.** Entra dal ponte una volta, quando l'utente la scrive, e non torna più indietro: il contratto non ha una funzione per rileggerla. Se va ricordata viene scritta in un file per servizio (`chiave-api.bin` per Anthropic, nome rimasto dalle versioni precedenti; `chiave-gemini.bin`; `chiave-openai.bin`), cifrata con `safeStorage` (portachiavi del sistema). Dove un portachiavi non c'è (alcuni Linux) non viene scritta: vale fino alla chiusura.
- **Rete.** Dalla finestra non parte nessuna richiesta. Il processo principale usa una sessione di rete dedicata, senza dati su disco, da cui si raggiungono solo gli indirizzi dei tre servizi (`allowedUrl` in `src/ia/indice.ts`).
- **Archivi.** File JSON in `archivi/` dentro la cartella dati, scritti prima su un file provvisorio e poi rinominati: un'interruzione non rovina l'archivio già salvato.
- **Chi chiama.** Ogni richiesta sul ponte viene accettata solo se arriva dalla pagina dell'app nella sua finestra.

### Dove sono salvati i dati

| Dato | Browser | App desktop |
|---|---|---|
| Archivi e abbinamenti | IndexedDB, database `ordine-rapido`, contenitore `archivi`, chiavi `art`, `cli`, `man`, `alias` | `archivi/art.json`, `cli.json`, `man.json`, `abbinamenti.json` nella cartella dati |
| Chiavi API | localStorage, `ordine-rapido-lettura` (servizio scelto, chiavi e modelli di ognuno) | `chiave-api.bin`, `chiave-gemini.bin`, `chiave-openai.bin` nella cartella dati, cifrate |
| Modello scelto | localStorage, `ordine-rapido-lettura` | come nel browser |
| Ordine in lavorazione | localStorage, `ordine-rapido-bozza`: salvato a ogni modifica, tolto con «Nuovo ordine» (`src/ui/bozza.ts`) | come nel browser |
| Tracciato | localStorage, `ordine-rapido-tracciato` | come nel browser |
| Tema, colonne visibili | localStorage, `ordine-rapido-ui` | come nel browser |

La cartella dati dell'app desktop è `%APPDATA%\Ordine Rapido` su Windows, `~/Library/Application Support/Ordine Rapido` su Mac, `~/.config/Ordine Rapido` su Linux.

Cambiare questi nomi o la forma dei dati salvati fa perdere gli archivi a chi aggiorna: è una modifica da versione MAGGIORE e va accompagnata da una lettura dei dati vecchi. L'app desktop lo fa già per chi arriva da una versione che teneva archivi e chiave nella finestra: li legge una volta e li sposta.

## Comandi

Serve [Node.js](https://nodejs.org/) 22.18 o successivo.

```bash
npm test                 # logica e progetto + controllo dei dati. Non richiede installazioni: Node legge direttamente TypeScript
npm run controlla-dati   # solo il controllo che cerca dati reali e credenziali
npm run versione         # controlla che package.json e CHANGELOG.md siano allineati

npm ci                   # installa gli strumenti: TypeScript, esbuild, Electron, electron-builder
npm run tipi             # controllo dei tipi su tutto src/, senza produrre file
npm run compila          # crea app/app.js, desktop/main.js e desktop/preload.js
npm run test:costruzione # prove sul codice compilato e sul processo principale (con un Electron simulato)
npm run costruisci       # compila e crea dist/Ordine-Rapido.html, l'app in un solo file
npm start                # compila e avvia l'app desktop
npm run pacchetti        # compila e costruisce in dist/ il pacchetto per il sistema su cui ti trovi
```

Se dopo `npm ci` l'app desktop non parte perché manca Electron, scaricalo con `node node_modules/electron/install.js`: alcune versioni di npm non eseguono da sole gli script di installazione dei pacchetti.

### Prove nel browser e come app desktop

Usano [Playwright](https://playwright.dev/), che non è tra le dipendenze del progetto per non appesantire l'installazione. Vanno eseguite dopo `npm run compila`.

```bash
npm install --no-save playwright
npx playwright install chromium

node test/e2e.js                             # app aperta da file
node test/e2e.js dist/Ordine-Rapido.html     # versione in un solo file
node test/ponte.js                           # interfaccia in modalità desktop, con il ponte simulato
node test/desktop.js                         # app desktop dal codice
node test/desktop.js dist/linux-unpacked/ordine-rapido   # app desktop impacchettata
```

Su Linux senza schermo, davanti alle prove dell'app desktop va messo `xvfb-run -a`.

I tre servizi sono simulati da `test/simulazione.js`, con la forma delle loro risposte: le prove non hanno bisogno di una chiave e non mandano nulla su internet. Controllano tra l'altro che nessuna richiesta parta verso altri siti e che gli archivi non vengano inviati con la lettura.

L'app desktop è coperta da tre prove, che si completano:

| Prova | Che cosa esegue davvero | Che cosa simula |
|---|---|---|
| `test/principale.test.mjs` | il processo principale: chiave, rete, archivi, controllo di chi chiama | Electron |
| `test/ponte.js` | l'interfaccia in modalità desktop, in Chromium | il processo principale |
| `test/desktop.js` | tutto, in Electron, compresa una foto letta dal riconoscimento dei caratteri | solo il servizio di Anthropic |

Le prime due girano ovunque. La terza ha bisogno di poter avviare Electron: su Windows con **Smart App Control** attivo l'eseguibile di Electron, che non è firmato, viene bloccato dal sistema; in quel caso la prova completa si lascia alle verifiche automatiche su GitHub.

## Regole per il codice

- **Nessun dato reale**, nemmeno nei commenti o nelle prove. Solo i dati di `esempi/` o altri costruiti allo stesso modo.
- **Niente contenuti inseriti come HTML.** Tutto ciò che arriva da un documento o da un archivio passa per `textContent`, attraverso la funzione `el()` di `src/ui/dom.ts`.
- **Nessun nuovo indirizzo di rete.** Una prova fallisce se il codice nomina un indirizzo diverso da quelli dei tre servizi, o se lo nomina fuori da `src/ia/`.
- **La logica sta in `src/core/`** e ogni comportamento nuovo ha la sua prova in `test/core.test.mjs`, `test/modello.test.mjs` (modello del gestionale) `test/lettura.test.mjs` (lettura sul dispositivo), `test/ricette.test.mjs` (ricette dei clienti) o `test/ia.test.mjs` (i tre servizi).
- **La lettura sul dispositivo non indovina.** Le regole di `src/core/lettura/` riempiono i campi; se un codice vale lo decide sempre l'abbinamento con l'archivio. Quando una regola fa una supposizione (un omaggio dedotto, una quantità senza unità, una correzione applicata) lo scrive tra gli avvisi.
- **Il controllo dei tipi deve passare** (`npm run tipi`), con le opzioni severe di `tsconfig.json`. Niente `any`: un dato di provenienza esterna è `unknown` finché non lo si è controllato.
- **Gli errori hanno un codice.** Si lanciano con `AppError` (`src/core/tipi.ts`); l'interfaccia traduce il codice nel messaggio per chi usa l'app.
- **Lo stato sta in un posto solo**, `src/ui/stato.ts`. I moduli dell'interfaccia non tengono copie proprie dei dati dell'ordine o degli archivi.
- **Il ponte non si allarga senza motivo.** Ogni funzione aggiunta a `src/desktop/contratto.ts` è una cosa in più che la pagina può chiedere al sistema: va controllata nel processo principale e provata in `test/principale.test.mjs`.
- Solo sintassi TypeScript che si cancella senza lasciare traccia (niente `enum`, niente proprietà dichiarate nei parametri del costruttore): è la condizione perché Node esegua le prove senza compilare.
- Testi dell'interfaccia in italiano, brevi, con i nomi che l'utente vede.
- Ogni modifica visibile ha la sua voce nel registro: vedi [RILASCI.md](RILASCI.md).

## Librerie di terzi

Le librerie che l'app usa mentre gira sono copiate in `app/vendor/` senza modifiche, non installate a ogni build: così chi controlla l'app sa esattamente che cosa contiene. `VENDOR.json` registra pacchetto, versione, origine, licenza e impronta SHA-256 di ogni file; `npm test` fallisce se un file non corrisponde. Si caricano solo quando servono (`src/ui/librerie.ts`).

TypeScript, esbuild, Electron ed electron-builder sono invece strumenti di sviluppo: stanno in `package.json` con la versione esatta, e `package-lock.json` ne fissa le impronte.

| File | Pacchetto | Versione |
|---|---|---|
| `pdf.min.js`, `pdf.worker.min.js` | pdfjs-dist | 3.11.174 |
| `xlsx.full.min.js` | xlsx (SheetJS Community Edition) | 0.20.3 |
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
- **SheetJS** pubblica le versioni successive alla 0.18.5 solo sul proprio sito, `cdn.sheetjs.com`, non sul registro npm: `npm pack xlsx@VERSIONE` restituirebbe la vecchia 0.18.5, vulnerabile. Il pacchetto si scarica con `npm pack https://cdn.sheetjs.com/xlsx-VERSIONE/xlsx-VERSIONE.tgz`.

## Pacchetti desktop

La configurazione è nel campo `build` di `package.json`. Nel pacchetto entrano `app/` e `desktop/` (quindi il codice compilato, non `src/`).

- `publish: null`: nessun aggiornamento automatico. L'app non controlla da sola se esistono versioni nuove.
- Mac: `identity: "-"` applica una firma locale senza certificato Apple, necessaria perché l'app parta sui processori Apple; `hardenedRuntime: false` è richiesto da quel tipo di firma.
- `appId` è `it.ordinerapido.app`. Non va cambiato: su Windows e Mac identifica l'app e la sua cartella dei dati.

Per firmare davvero i pacchetti servono un certificato di firma del codice per Windows e l'iscrizione al programma sviluppatori di Apple; vanno aggiunti come segreti della repository e configurati in `electron-builder`. Senza firma, su Windows 11 con Smart App Control attivo l'app installata non parte: vedi [SECURITY.md](../SECURITY.md).
