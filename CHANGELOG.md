# Registro delle modifiche

Qui è descritto tutto quello che cambia in Ordine Rapido, versione per versione.

- Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/); i numeri seguono il [versionamento semantico](https://semver.org/lang/it/).
- Le modifiche sono divise in gruppi: **Aggiunto**, **Modificato**, **Deprecato**, **Rimosso**, **Corretto**, **Sicurezza**.
- Ogni voce risponde a tre domande: **che cosa cambia**, **perché**, **che cosa devi fare**.
- Quando una modifica tocca il file esportato, la voce mostra il prima e il dopo.
- Le modifiche non ancora rilasciate stanno in cima, sotto «Non rilasciato».

Come si scrive una voce e come si pubblica una versione: [docs/RILASCI.md](docs/RILASCI.md).

## [Non rilasciato]

La versione 1.0.0 non è ancora stata pubblicata: al momento del rilascio queste voci possono confluire nella 1.0.0 oppure diventare la versione successiva (vedi [docs/RILASCI.md](docs/RILASCI.md)).

### Modificato

#### Il codice è scritto in TypeScript e diviso in moduli

- **Che cosa cambia.** Il codice dell'app non è più in due file JavaScript scritti a mano (`app/core.js` e `app/app.js`, quest'ultimo di quasi 1.300 righe) ma in TypeScript nella cartella `src/`, diviso per compito: logica (`src/core/`), colloquio con Anthropic (`src/anthropic/`), ambienti (`src/piattaforma/`), interfaccia (`src/ui/`), app desktop (`src/desktop/`). Uno script (`npm run compila`) produce i file che l'app esegue. Per chi usa l'app non cambia nulla di visibile: schermate, file esportato e formato della copia di sicurezza sono gli stessi.
- **Perché.** In un file unico senza controlli gli errori si scoprono solo usando l'app. Con TypeScript vengono trovati prima dell'avvio, e la divisione in moduli impedisce per costruzione alcune confusioni: la logica non può toccare la pagina, la pagina non può usare Electron. Una prova lo fa rispettare.
- **Che cosa devi fare.** Niente se usi l'app. Se la modifichi: serve Node.js 22.18 o successivo, e prima di aprire `app/index.html` va eseguito `npm run compila`. La nuova organizzazione è descritta in [docs/SVILUPPO.md](docs/SVILUPPO.md).

#### App desktop: gli archivi sono file nella cartella dati dell'app

- **Che cosa cambia.** Nell'app desktop articoli, clienti, mandanti e abbinamenti imparati non stanno più nel database interno della finestra ma in file JSON nella cartella dati dell'app (`archivi/`). Ogni salvataggio scrive un file provvisorio che solo alla fine prende il posto di quello valido.
- **Perché.** File veri sono più facili da ritrovare e da includere nelle copie del computer, e un'interruzione a metà salvataggio non rovina l'archivio già presente.
- **Che cosa devi fare.** Niente: al primo avvio gli archivi salvati da una versione precedente vengono letti e riscritti nel posto nuovo. La versione portatile `Ordine-Rapido.html` continua a salvarli nel browser.

### Sicurezza

#### App desktop: la chiave API è custodita fuori dalla finestra e cifrata

- **Che cosa cambia.** Nell'app desktop la chiave API non è più salvata in chiaro tra i dati della finestra. La custodisce il processo principale: la finestra la consegna una volta e non può più rileggerla (nelle impostazioni compaiono solo gli ultimi caratteri). Se scegli di ricordarla viene scritta su disco cifrata dal sistema operativo; su un Linux senza portachiavi non viene scritta e va inserita a ogni avvio.
- **Perché.** Una chiave in chiaro tra i dati di una pagina può essere letta da chiunque apra quei file, e da qualunque codice riesca a girare nella pagina. Tenerla nel processo principale toglie entrambe le possibilità.
- **Che cosa devi fare.** Niente: una chiave salvata da una versione precedente viene spostata da sola al primo avvio e tolta dal posto vecchio. Nella versione portatile `Ordine-Rapido.html` la chiave resta in chiaro tra i dati del browser, perché un browser non offre un posto protetto: vedi [SECURITY.md](SECURITY.md).

#### App desktop: dalla finestra non parte più nessuna richiesta di rete

- **Che cosa cambia.** È il processo principale, non la finestra, a parlare con Anthropic, da una sessione di rete dedicata che raggiunge solo `api.anthropic.com`. Dalla finestra è bloccata ogni richiesta, compresa quella verso Anthropic.
- **Perché.** Così un documento costruito apposta, anche se riuscisse a far eseguire codice nella pagina, non avrebbe né la chiave né un modo per spedire dati.
- **Che cosa devi fare.** Niente.

#### Libreria per i file Excel aggiornata

- **Che cosa cambia.** La libreria che legge i file Excel (SheetJS) passa dalla versione 0.18.5 alla 0.20.3.
- **Perché.** La versione precedente aveva due vulnerabilità note (CVE-2023-30533 e CVE-2024-22363), sfruttabili con un file Excel costruito apposta. La 0.20.3 le corregge.
- **Che cosa devi fare.** Niente. Non serve più la cautela di aprire solo file Excel di provenienza nota per questo motivo; resta buona norma non aprire file inattesi.

### Limiti noti

- **Windows 11 con Smart App Control.** Su questi computer il sistema blocca i programmi non firmati, senza possibilità di proseguire: l'app desktop non parte finché i pacchetti non vengono firmati con un certificato di firma del codice. Resta utilizzabile la versione portatile `Ordine-Rapido.html`. Dettagli in [SECURITY.md](SECURITY.md).

## [1.0.0] - 2026-11-27

Prima versione pubblica e open source.

**In breve.** Fino a oggi Ordine Rapido esisteva solo come pagina dentro Claude, dove portava il numero 3.0. Questa versione la trasforma in un'app che chiunque può scaricare e usare da sola su Windows, Linux e Mac, con licenza GPL-3.0. Per riuscirci cambia tre cose di fondo: la lettura degli ordini usa la chiave API di chi usa l'app, gli archivi restano sul dispositivo, e tutto ciò che prima veniva scaricato da internet ora viaggia insieme all'app. Si aggiunge inoltre l'archivio delle case mandanti.

**Per chi usava la versione 3.0 dentro Claude.** Gli archivi caricati in quella pagina restano là e non passano da soli a questa versione: vanno ricaricati dagli elenchi esportati dal gestionale. Da qui in poi, per spostarli tra computer e versioni, c'è la copia di sicurezza.

### Aggiunto

#### L'app funziona da sola, fuori da Claude

- **Che cosa cambia.** L'app si scarica dalla pagina dei rilasci e si avvia sul proprio computer, in due forme: la versione portatile `Ordine-Rapido.html`, un solo file da aprire con il browser, e l'app desktop per Windows (installazione e portatile), Linux (AppImage) e Mac (Apple e Intel).
- **Perché.** L'app deve poter essere usata da chiunque senza un sito, un dominio o un account su un servizio di pubblicazione.
- **Che cosa devi fare.** Scegli il file adatto al tuo sistema seguendo il [README](README.md#scaricare-e-avviare). Al primo avvio Windows e Mac mostrano un avviso, perché i pacchetti non hanno una firma digitale a pagamento: il README spiega come autorizzarli.

#### Lettura automatica con la propria chiave API

- **Che cosa cambia.** In **Impostazioni → Lettura automatica** si inserisce la propria chiave API di Anthropic. L'app la verifica, legge dall'account l'elenco dei modelli disponibili e propone quale usare. Finché la chiave manca, la schermata iniziale lo dice e porta alle impostazioni. La chiave si può mostrare, rimuovere, oppure non far ricordare affatto.
- **Perché.** Dentro Claude la lettura passava per la pagina. Un'app senza server non può contenere una chiave condivisa: sarebbe pubblica e chiunque potrebbe usarla a spese di qualcun altro. Ognuno usa quindi la propria.
- **Che cosa devi fare.** Crea una chiave nella Console di Anthropic e incollala nelle impostazioni. Ogni lettura ha un costo addebitato all'account della chiave e richiede internet. Senza chiave l'app resta utilizzabile: righe scritte a mano, collegamento all'archivio, controlli ed esportazione.

#### Archivio delle case mandanti

- **Che cosa cambia.** Accanto ad articoli e clienti si può caricare l'elenco delle mandanti: codice, ragione sociale, partita IVA. La mandante dell'ordine viene riconosciuta per partita IVA o per ragione sociale, il suo codice compare tra i dati dell'ordine e viene esportato nella nuova colonna `CodMandante`. Tra i controlli compare «Mandante in anagrafica» oppure «Casa mandante non trovata in anagrafica».
- **Perché.** Il file deve portare al gestionale tutti i dati di testata con i codici che esistono già. Prima la mandante viaggiava solo come nome, così come era scritto sul documento del cliente.
- **Che cosa devi fare.** Esporta dal gestionale l'elenco delle mandanti e caricalo da **Archivio → Carica export mandanti**. Se non lo carichi, l'app funziona come prima e la colonna `CodMandante` resta vuota. Vedi sotto, in «Modificato», l'effetto sul file.

#### Copia di sicurezza degli archivi

- **Che cosa cambia.** Da **Archivio → Salva una copia** si scarica un file `ordine-rapido-archivio_AAAA-MM-GG.json` con articoli, clienti, mandanti, abbinamenti imparati e tracciato. **Ripristina** lo ricarica, dopo aver mostrato che cosa contiene e aver chiesto conferma. La chiave API non entra mai nella copia.
- **Perché.** Gli archivi ora vivono sul dispositivo. Serve un modo per portarli su un altro computer, conservarli prima di un aggiornamento e recuperarli se il browser cancella i propri dati.
- **Che cosa devi fare.** Fai una copia dopo aver caricato gli archivi e prima di ogni aggiornamento. La copia contiene dati reali: conservala in un posto sicuro e non pubblicarla. Il formato è descritto in [docs/FORMATI.md](docs/FORMATI.md).

#### Scaricamento del CSV

- **Che cosa cambia.** **Scarica CSV** salva il file con il normale download del browser, o con la finestra «Salva con nome» nell'app desktop. Prima, fuori da Claude, il pulsante era nascosto e restava solo la copia negli appunti.
- **Perché.** Un'app autonoma deve poter consegnare il file.
- **Che cosa devi fare.** Niente. **Copia righe** e **Copia CSV** restano disponibili.

#### Dati di esempio

- **Che cosa cambia.** La cartella `esempi/` contiene tre archivi di fantasia, un ordine in PDF e un messaggio, coerenti con l'ordine di prova già presente nell'app.
- **Perché.** Chi scarica l'app deve poterla provare senza usare dati propri, e chi contribuisce deve poter lavorare senza dati reali.
- **Che cosa devi fare.** Niente. Per provarli segui il [README](README.md#provare-con-i-dati-di-esempio).

#### Prove automatiche, controllo dei dati e rilascio

- **Che cosa cambia.** La repository contiene 21 prove sulla logica e sul progetto, una prova completa nel browser, una prova dell'app desktop, un controllo che cerca dati reali e credenziali nei file, e una procedura di rilascio che costruisce i pacchetti e prepara la bozza con queste note.
- **Perché.** Una modifica non deve poter rompere la regola dei codici esistenti, né far entrare dati reali nella repository, senza che qualcuno se ne accorga.
- **Che cosa devi fare.** Niente se usi l'app. Se contribuisci, leggi [CONTRIBUTING.md](CONTRIBUTING.md).

### Modificato

#### Numerazione delle versioni: da 3.0 a 1.0.0

- **Che cosa cambia.** L'app mostra `1.0.0` al posto di `3.0`. La numerazione riparte con la prima versione pubblica e da qui segue il versionamento semantico.
- **Perché.** I numeri precedenti contavano le riscritture fatte durante lo sviluppo privato e non seguivano una regola. Ripartire dà a ogni cifra un significato preciso.
- **Che cosa devi fare.** Niente. La 1.0.0 contiene tutto quello che c'era nella 3.0.

#### Nuova colonna `CodMandante` nel file esportato

- **Che cosa cambia.** Il tracciato iniziale ha una colonna in più, `CodMandante`, subito prima di `Mandante`. Le colonne passano da 19 a 20.

  Prima (3.0):

  ```text
  …;CodCliente;Cliente;PIvaCliente;Mandante;Pagamento;Destinazione;Note
  …;C0012;MARKET FANTASIA S.R.L.;01234500033;CONSERVE FANTASIA S.P.A.;RIBA 30 GG DF FM;;
  ```

  Dopo (1.0.0):

  ```text
  …;CodCliente;Cliente;PIvaCliente;CodMandante;Mandante;Pagamento;Destinazione;Note
  …;C0012;MARKET FANTASIA S.R.L.;01234500033;M001;CONSERVE FANTASIA S.P.A.;RIBA 30 GG DF FM;;
  ```

- **Perché.** È la colonna che porta al gestionale il codice della mandante riconosciuta in archivio.
- **Che cosa devi fare.** Se il tuo gestionale importa le colonne per posizione, controlla il tracciato in **Impostazioni → Tracciato del file**: puoi spegnere `CodMandante`, spostarla o rinominarla. Chi importa in GesACom con **Importa righe da Excel** assegna i campi a mano e non deve cambiare nulla.

#### Dove vengono salvati archivi, abbinamenti e tracciato

- **Che cosa cambia.** Fuori da Claude gli archivi sono salvati sul dispositivo, nel database del browser o dell'app desktop, che regge anche listini grandi. Se il database non è disponibile si usa la memoria locale del browser; se nemmeno quella, i dati valgono fino alla chiusura e l'app lo dice. Il tracciato e le impostazioni cambiano nome interno, da `gesacom-…` a `ordine-rapido-…`.
- **Perché.** Lo spazio privato della pagina esiste solo dentro Claude, e la memoria locale usata come ripiego era troppo piccola per un archivio articoli completo.
- **Che cosa devi fare.** Niente. Se nello stesso browser avevi già usato la pagina fuori da Claude, tracciato e archivi salvati con i vecchi nomi vengono letti e spostati da soli al primo avvio.

#### Librerie e caratteri inclusi nell'app

- **Che cosa cambia.** Le librerie per leggere PDF ed Excel e i due caratteri dell'interfaccia non vengono più scaricati da siti esterni: sono nella cartella `app/vendor`, e dentro il file stesso nella versione portatile. L'app non contatta più `cdnjs.cloudflare.com`, `fonts.googleapis.com` e `fonts.gstatic.com`.
- **Perché.** L'app deve funzionare senza connessione e senza far sapere a terzi quando viene usata. L'unico collegamento rimasto è quello verso Anthropic per la lettura automatica.
- **Che cosa devi fare.** Niente. L'aspetto è lo stesso.

#### Pannello delle impostazioni

- **Che cosa cambia.** Il pulsante in alto a destra apre **Impostazioni**, con due parti: «Lettura automatica» e «Tracciato del file». In fondo compaiono versione, licenza e collegamento al codice sorgente. I dati dell'ordine hanno il nuovo campo «Codice mandante».
- **Perché.** Serviva un posto per la chiave API, e la licenza chiede che l'app indichi dove trovare il codice.
- **Che cosa devi fare.** Niente. Il tracciato è dove era prima, un po' più in basso.

#### Codici trovati in automatico

- **Che cosa cambia.** Se correggi il nome o la partita IVA del cliente, o il nome della mandante, dopo che l'app ne aveva trovato il codice, il codice viene ricalcolato. Un codice scritto da te non viene mai toccato.
- **Perché.** Prima il codice trovato restava anche dopo aver cambiato il nome, e nel file poteva finire il codice del cliente sbagliato.
- **Che cosa devi fare.** Niente.

### Corretto

#### Avviso «riga senza codice articolo» su righe già collegate

- **Che cosa cambia.** Una riga collegata all'archivio per EAN o per un abbinamento imparato non viene più segnalata come priva di codice.
- **Perché.** Nel file quella riga esce con il codice dell'archivio: l'avviso segnalava un problema che non c'era e sporcava il conteggio delle cose da verificare.
- **Che cosa devi fare.** Niente.

#### Collegamento al manuale del gestionale

- **Che cosa cambia.** Il collegamento al manuale nella schermata Esporta si apre in una nuova scheda, o nel browser se usi l'app desktop.
- **Perché.** Prima prendeva il posto dell'app, e l'ordine aperto andava perso.
- **Che cosa devi fare.** Niente.

### Sicurezza

#### Nessun dato reale nella repository

- **Che cosa cambia.** Il codice pubblicato è stato controllato riga per riga: non contiene credenziali, clienti, listini o ordini reali. L'ordine di prova usa aziende inventate e una partita IVA con cifra di controllo sbagliata. Un controllo automatico e il file `.gitignore` impediscono che dati reali entrino in seguito.
- **Perché.** Quello che viene pubblicato su GitHub resta pubblico, anche nella cronologia.
- **Che cosa devi fare.** Se contribuisci, usa solo i dati di `esempi/`. Non allegare ordini o esportazioni reali alle segnalazioni.

#### L'app può collegarsi a un solo indirizzo

- **Che cosa cambia.** La pagina dichiara una regola del browser (Content Security Policy) che permette collegamenti soltanto verso `api.anthropic.com`. L'app desktop aggiunge un secondo blocco sulle richieste di rete, apre nel browser solo collegamenti verso siti previsti e rifiuta fotocamera, microfono e posizione.
- **Perché.** Chiave API e archivi non devono poter uscire verso altri indirizzi, nemmeno se un documento ricevuto fosse costruito apposta per provarci.
- **Che cosa devi fare.** Niente.

#### I PDF non possono far eseguire codice

- **Che cosa cambia.** La libreria che legge i PDF viene usata con l'esecuzione di codice dai documenti disattivata (`isEvalSupported: false`).
- **Perché.** La versione inclusa, pdf.js 3.11.174, ha una vulnerabilità nota (CVE-2024-4367) che questa impostazione rende inoffensiva. L'app apre PDF ricevuti da terzi.
- **Che cosa devi fare.** Niente.

### Limiti noti

- **Pacchetti per Windows e Mac non ancora provati su quei sistemi.** L'app, la versione portatile e il pacchetto Linux sono stati provati davvero. I pacchetti per Windows e Mac vengono costruiti e avviati per la prima volta dalla procedura di rilascio su GitHub, che si ferma se uno di essi non parte.
- **Pacchetti non firmati.** Windows e Mac mostrano un avviso al primo avvio. Le istruzioni sono nel README.
- **Libreria Excel.** È inclusa SheetJS 0.18.5, che ha due vulnerabilità note legate all'apertura di file Excel costruiti apposta (CVE-2023-30533 e CVE-2024-22363). La versione corretta non è distribuita dal registro da cui provengono le altre librerie. Finché non viene aggiornata, apri solo file Excel di cui conosci la provenienza. Dettagli in [SECURITY.md](SECURITY.md).
- **Versione portatile.** I dati sono salvati nel browser e alcuni browser li legano alla posizione del file: tienilo sempre nella stessa cartella con lo stesso nome. È stata provata con Chromium.
- **Lettura automatica.** Richiede internet e una chiave API. Vengono lette le prime 6 pagine di un PDF e al massimo 12 immagini per ordine.
- **Uso dentro Claude.** Il codice conserva il funzionamento come pagina dentro Claude, ma questa versione non è stata riprovata in quella forma.

[Non rilasciato]: ../../compare/v1.0.0...HEAD
[1.0.0]: ../../releases/tag/v1.0.0
