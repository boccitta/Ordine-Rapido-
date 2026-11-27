# Registro delle modifiche

Qui è descritto tutto quello che cambia in Ordine Rapido, versione per versione.

- Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/); i numeri seguono il [versionamento semantico](https://semver.org/lang/it/).
- Le modifiche sono divise in gruppi: **Aggiunto**, **Modificato**, **Deprecato**, **Rimosso**, **Corretto**, **Sicurezza**.
- Ogni voce risponde a tre domande: **che cosa cambia**, **perché**, **che cosa devi fare**.
- Quando una modifica tocca il file esportato, la voce mostra il prima e il dopo.
- Le modifiche non ancora rilasciate stanno in cima, sotto «Non rilasciato».

Come si scrive una voce e come si pubblica una versione: [docs/RILASCI.md](docs/RILASCI.md).

## [Non rilasciato]

Nessuna modifica in attesa.

## [1.0.0] - 2026-11-27

Prima versione pubblica e open source.

**In breve.** Fino a oggi Ordine Rapido esisteva solo come pagina dentro Claude, dove portava il numero 3.0. Questa versione la trasforma in un'app che chiunque può scaricare e usare da sola su Windows, Linux e Mac, con licenza GPL-3.0. Per riuscirci cambia tre cose di fondo: la lettura degli ordini usa la chiave API di chi usa l'app, gli archivi restano sul dispositivo, e tutto ciò che prima veniva scaricato da internet ora viaggia insieme all'app. Si aggiunge inoltre l'archivio delle case mandanti. L'ordine in lavorazione viene salvato a ogni modifica, e nell'app desktop la chiave API è custodita fuori dalla finestra, cifrata dal sistema.

**Per chi usava la versione 3.0 dentro Claude.** Gli archivi caricati in quella pagina restano là e non passano da soli a questa versione: vanno ricaricati dagli elenchi esportati dal gestionale. Da qui in poi, per spostarli tra computer e versioni, c'è la copia di sicurezza.

### Aggiunto

#### L'app funziona da sola, fuori da Claude

- **Che cosa cambia.** L'app si scarica dalla pagina dei rilasci e si avvia sul proprio computer, in due forme: la versione portatile `Ordine-Rapido.html`, un solo file da aprire con il browser, e l'app desktop per Windows (installazione e portatile), Linux (AppImage) e Mac (Apple e Intel).
- **Perché.** L'app deve poter essere usata da chiunque senza un sito, un dominio o un account su un servizio di pubblicazione.
- **Che cosa devi fare.** Scegli il file adatto al tuo sistema seguendo il [README](README.md#scaricare-e-avviare). Al primo avvio Windows e Mac mostrano un avviso, perché i pacchetti non hanno una firma digitale a pagamento: il README spiega come autorizzarli.

#### Gli ordini si leggono sul dispositivo, senza chiave API

- **Che cosa cambia.** L'app legge gli ordini da sola: Excel e CSV, PDF con testo, messaggi e mail, foto e scansioni. Non serve una chiave, non costa nulla e niente esce dal dispositivo. Sono regole ancorate all'archivio: riconoscono la tabella dell'ordine dai nomi delle colonne, incolonnano i numeri dalla loro posizione, trovano cliente e casa mandante tra quelli dell'archivio e propongono un articolo per le descrizioni senza codice. Per le foto l'app include il riconoscimento dei caratteri (modelli PP-OCRv6 «tiny» con ONNX Runtime), che lavora in un processo separato e si carica solo alla prima foto.
- **Perché.** Chi non vuole una chiave API, o non può inviare fuori i documenti dei clienti, deve poter usare l'app per intero. E deve funzionare anche su computer modesti: niente scheda grafica, niente programmi da installare a parte.
- **Che cosa devi fare.** Niente: è il modo predefinito. La scrittura a mano viene letta male e l'app lo segnala; in quei casi puoi far leggere a Claude (vedi sotto) oppure correggere le righe. La lettura delle foto è nelle app per Windows, Linux e Mac e nella cartella `app/`, non nella versione in un solo file. Si sceglie chi legge in **Impostazioni → Chi legge gli ordini**.

#### Il modello del gestionale

- **Che cosa cambia.** Prima di tutto si può caricare un file di esempio nel formato che il gestionale importa. L'app riconosce le colonne dal nome, mostra che cosa metterà in ognuna e ricava dalle righe di esempio separatore, decimali, date e codifica. Le colonne che non corrispondono a un dato dell'ordine restano vuote oppure ricevono sempre lo stesso valore (per esempio il tipo di documento). Il file può essere anche un Excel (`.xlsx`), con quantità, prezzi e sconti scritti come numeri. Alla prima apertura la schermata «Carica» propone i due passaggi iniziali: modello e archivio.
- **Perché.** Ogni gestionale vuole il file a modo suo. Spiegarlo all'app con un esempio è più semplice e più sicuro che impostare a mano colonne e formati.
- **Che cosa devi fare.** In **Impostazioni → File per il gestionale** premi **Carica il modello**, controlla le colonne e conferma. Senza modello vale il tracciato predefinito, come prima.

Prima (tracciato predefinito) e dopo (con un modello di cinque colonne, la prima a valore fisso):

```text
CodArticolo;Descrizione;Unimis;Quantita;Colli;Prezzo;Sconto1;Sconto2;Omaggio;NumOrdine;…
300101;PASSATA DI POMODORO BOTTIGLIA GR 700;PZ;120;10;0,85;5;;N;2026/0412;…
```

```text
TipoDoc;CodArticolo;Qta;Prezzo;DataOrdine
OC;300101;120;0,85;23/11/2026
```

#### Quantità in pezzi dai colli

- **Che cosa cambia.** L'archivio articoli riconosce anche la colonna dei pezzi per collo (per esempio «Confezione»). Quando un ordine indica solo i cartoni, la quantità in pezzi viene calcolata per le righe collegate all'archivio, e l'app lo scrive tra le note di lettura.
- **Perché.** Molti clienti ordinano «6 cartoni di…»: il gestionale di solito vuole anche i pezzi.
- **Che cosa devi fare.** Ricarica l'elenco degli articoli se vuoi usare questa colonna. Una quantità già scritta non viene mai toccata.

#### Lettura con Claude e la propria chiave API

- **Che cosa cambia.** Per le scritture a mano e i documenti difficili si può far leggere a Claude: in **Impostazioni → Lettura degli ordini** si inserisce la propria chiave API di Anthropic. L'app la verifica, legge dall'account l'elenco dei modelli disponibili e propone quale usare. Finché la chiave manca legge questo dispositivo: la schermata iniziale lo dice e porta alle impostazioni. La chiave si può mostrare, rimuovere, oppure non far ricordare affatto.
- **Perché.** Dentro Claude la lettura passava per la pagina. Un'app senza server non può contenere una chiave condivisa: sarebbe pubblica e chiunque potrebbe usarla a spese di qualcun altro. Ognuno usa quindi la propria.
- **Che cosa devi fare.** Crea una chiave nella Console di Anthropic e incollala nelle impostazioni. Ogni lettura ha un costo addebitato all'account della chiave e richiede internet. Senza chiave l'app legge comunque gli ordini sul dispositivo.

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

#### L'ordine in corso non si perde

- **Che cosa cambia.** L'ordine che stai controllando viene salvato sul dispositivo a ogni modifica. Se chiudi l'app per sbaglio, o il computer si spegne, alla riapertura la schermata **Carica** avvisa che c'è un ordine aperto e **Torna all'ordine aperto** lo riporta com'era: righe, dati dell'ordine e note di lettura. I collegamenti con l'archivio vengono ricalcolati. L'ordine salvato sparisce quando premi **Nuovo ordine** o apri l'ordine di esempio.
- **Perché.** Controllare un ordine lungo richiede tempo: non deve bastare una finestra chiusa per ricominciare da capo.
- **Che cosa devi fare.** Niente. L'ordine in corso resta sul dispositivo, in chiaro come gli archivi: su un computer condiviso premi **Nuovo ordine** quando hai finito.

#### Avviso quando qualcosa va storto

- **Che cosa cambia.** Se l'app incontra un errore che non aveva previsto compare in basso un avviso che lo dice e spiega che cosa fare, invece di restare ferma senza spiegazioni.
- **Perché.** Un errore passato in silenzio lascia nel dubbio se il lavoro fatto sia valido.
- **Che cosa devi fare.** Niente. Se l'avviso compare, il tuo ordine è già salvato: riprova, oppure chiudi e riapri l'app.

#### Dati di esempio

- **Che cosa cambia.** La cartella `esempi/` contiene tre archivi di fantasia, un ordine in PDF e un messaggio, coerenti con l'ordine di prova già presente nell'app.
- **Perché.** Chi scarica l'app deve poterla provare senza usare dati propri, e chi contribuisce deve poter lavorare senza dati reali.
- **Che cosa devi fare.** Niente. Per provarli segui il [README](README.md#provare-con-i-dati-di-esempio).

#### Codice controllato, prove automatiche, controllo dei dati e rilascio

- **Che cosa cambia.** Il codice è scritto in TypeScript e diviso in moduli con compiti separati: un controllo automatico trova gli errori prima che l'app venga avviata, e una prova impedisce che le parti si mescolino (la logica non può toccare la pagina, la pagina non può usare il sistema). La repository contiene prove sulla logica e sul progetto, prove sul processo principale dell'app desktop, una prova completa nel browser, una dell'interfaccia in modalità desktop, una dell'app desktop avviata davvero, un controllo che cerca dati reali e credenziali nei file, e una procedura di rilascio che costruisce i pacchetti e prepara la bozza con queste note.
- **Perché.** Una modifica non deve poter rompere la regola dei codici esistenti, né far entrare dati reali nella repository, senza che qualcuno se ne accorga.
- **Che cosa devi fare.** Niente se usi l'app. Se contribuisci, leggi [CONTRIBUTING.md](CONTRIBUTING.md) e [docs/SVILUPPO.md](docs/SVILUPPO.md).

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

- **Che cosa cambia.** Fuori da Claude gli archivi sono salvati sul dispositivo. Nell'app desktop sono file nella cartella dati dell'app, scritti in modo che un'interruzione a metà non rovini l'archivio già salvato. Nella versione portatile stanno nel database del browser, che regge anche listini grandi; se il database non è disponibile si usa la memoria locale del browser; se nemmeno quella, i dati valgono fino alla chiusura e l'app lo dice. Il tracciato e le impostazioni cambiano nome interno, da `gesacom-…` a `ordine-rapido-…`.
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

#### Tabella delle righe e schermata Esporta

- **Che cosa cambia.** Nella tabella delle righe il numero di riga, lo stato in archivio e il pulsante per eliminare restano sempre visibili, anche quando la tabella è più larga dello schermo e scorre di lato. Nella schermata **Esporta**, quando una riga blocca il file, il pulsante in evidenza diventa **Torna al controllo**.
- **Perché.** Con tutte le colonne aperte, o su uno schermo stretto, lo stato della riga e il pulsante per eliminarla finivano fuori vista. E quando il file non può uscire, il passo utile è tornare a sistemare, non scaricare.
- **Che cosa devi fare.** Niente.

### Corretto

#### Confronto dell'importo quando manca un prezzo

- **Che cosa cambia.** Se una riga non ha prezzo o quantità, il controllo dice «Importo merce non confrontabile con il documento» e quante righe sono incomplete.
- **Perché.** Prima compariva un errore con due cifre uguali, per esempio «Importo merce 435,86, sul documento 435,86», che non spiegava che cosa non andava.
- **Che cosa devi fare.** Completa il prezzo o la quantità della riga indicata, oppure eliminala.

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

- **Che cosa cambia.** La pagina dichiara una regola del browser (Content Security Policy) che permette collegamenti soltanto verso `api.anthropic.com`. Nell'app desktop dalla finestra non parte nessuna richiesta di rete, nemmeno verso Anthropic: con il servizio parla solo il processo principale, da una sessione di rete dedicata che raggiunge quell'unico indirizzo. La finestra apre nel browser solo collegamenti verso siti previsti e rifiuta fotocamera, microfono e posizione.
- **Perché.** Chiave API e archivi non devono poter uscire verso altri indirizzi, nemmeno se un documento ricevuto fosse costruito apposta per provarci.
- **Che cosa devi fare.** Niente.

#### App desktop: la chiave API è custodita fuori dalla finestra e cifrata

- **Che cosa cambia.** Nell'app desktop la chiave API non resta tra i dati della finestra. La custodisce il processo principale: la finestra la consegna una volta e non può più rileggerla (nelle impostazioni compaiono solo gli ultimi caratteri). Se scegli di ricordarla viene scritta su disco cifrata dal sistema operativo; su un Linux senza portachiavi non viene scritta e va inserita a ogni avvio.
- **Perché.** Una chiave in chiaro tra i dati di una pagina può essere letta da chiunque apra quei file, e da qualunque codice riesca a girare nella pagina. Tenerla nel processo principale toglie entrambe le possibilità.
- **Che cosa devi fare.** Niente. Nella versione portatile `Ordine-Rapido.html` la chiave resta in chiaro tra i dati del browser, perché un browser non offre un posto protetto: vedi [SECURITY.md](SECURITY.md).

#### Libreria per i file Excel senza vulnerabilità note

- **Che cosa cambia.** I file Excel vengono letti con SheetJS 0.20.3.
- **Perché.** Le versioni fino alla 0.18.5, l'ultima sul registro da cui provengono le altre librerie, hanno due vulnerabilità note (CVE-2023-30533 e CVE-2024-22363), sfruttabili con un file Excel costruito apposta. La 0.20.3, presa dal sito del produttore, le corregge.
- **Che cosa devi fare.** Niente.

#### I PDF non possono far eseguire codice

- **Che cosa cambia.** La libreria che legge i PDF viene usata con l'esecuzione di codice dai documenti disattivata (`isEvalSupported: false`).
- **Perché.** La versione inclusa, pdf.js 3.11.174, ha una vulnerabilità nota (CVE-2024-4367) che questa impostazione rende inoffensiva. L'app apre PDF ricevuti da terzi.
- **Che cosa devi fare.** Niente.

### Limiti noti

- **Pacchetti provati solo in automatico.** I pacchetti per Windows, Linux e Mac vengono costruiti dalla procedura di rilascio su GitHub, che avvia ciascuno sul proprio sistema, ne prova le funzioni principali e si ferma se uno non parte. Non sono stati provati a mano su computer di uso quotidiano.
- **Pacchetti non firmati.** Windows e Mac mostrano un avviso al primo avvio. Le istruzioni sono nel README. Su Windows 11 con **Smart App Control** attivo non c'è solo un avviso: il sistema blocca i programmi non firmati e l'app desktop non parte finché i pacchetti non vengono firmati con un certificato di firma del codice. Su quei computer resta utilizzabile la versione portatile `Ordine-Rapido.html`. Dettagli in [SECURITY.md](SECURITY.md).
- **Versione portatile.** I dati sono salvati nel browser e alcuni browser li legano alla posizione del file: tienilo sempre nella stessa cartella con lo stesso nome. È stata provata con Chromium.
- **Lettura automatica.** Richiede internet e una chiave API. Vengono lette le prime 6 pagine di un PDF e al massimo 12 immagini per ordine.
- **Uso dentro Claude.** Il codice conserva il funzionamento come pagina dentro Claude, ma questa versione non è stata riprovata in quella forma.

[Non rilasciato]: ../../compare/v1.0.0...HEAD
[1.0.0]: ../../releases/tag/v1.0.0
