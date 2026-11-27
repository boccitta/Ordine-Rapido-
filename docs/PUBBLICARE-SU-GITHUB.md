# Pubblicare Ordine Rapido su GitHub

Guida per la prima pubblicazione, passo per passo. Non serve saper programmare.

Ti servono: un account GitHub e [GitHub Desktop](https://github.com/apps/desktop), l'app gratuita di GitHub per Windows e Mac.

## Prima di cominciare

1. Estrai lo zip in una cartella stabile, per esempio `Documenti/ordine-rapido`. Dentro devi vedere `README.md`, `LICENSE`, `app`, `docs` e le altre cartelle.
2. Non aggiungere nella cartella nessun file tuo: niente ordini, listini o esportazioni del gestionale. Tutto quello che c'è nella cartella diventerà pubblico.

## 1. Apri la repository in GitHub Desktop

La cartella contiene già la repository, con un primo salvataggio a tuo nome che comprende tutti i file.

1. Apri GitHub Desktop e accedi con il tuo account.
2. Scegli **File → Add local repository**, indica la cartella `ordine-rapido` e premi **Add repository**.

Se GitHub Desktop avvisa che la cartella non è una repository, premi **create a repository**, lascia vuoti i campi «Git ignore» e «License», non spuntare «Initialize this repository with a README» e premi **Create repository**.

## 2. Controlla che cosa stai per pubblicare

1. In GitHub Desktop apri **History**: c'è un primo salvataggio con tutti i file.
2. Scorri l'elenco. Devi trovare solo file del progetto. Gli unici file di dati sono quelli della cartella `esempi`.
3. Se vedi un file che non riconosci, fermati e toglilo dalla cartella prima di proseguire.

## 3. Pubblica

1. Premi **Publish repository**.
2. **Togli la spunta da «Keep this code private»**: un progetto open source deve essere pubblico.
3. Premi **Publish repository**.

La repository è ora all'indirizzo `https://github.com/TUO-NOME-UTENTE/ordine-rapido`.

## 4. Guarda le verifiche

1. Apri la repository nel browser e vai alla scheda **Actions**.
2. Trovi la procedura **Verifiche** in corso. Dura alcuni minuti.
3. Un segno verde vuol dire che prove, controllo dei dati e prova dell'app sono passati anche su GitHub.

Se compare un segno rosso, apri la procedura e leggi quale passo si è fermato. Non pubblicare la versione finché le verifiche non sono verdi.

## 5. Pubblica la versione 1.0.0

1. Nel file `CHANGELOG.md` la versione 1.0.0 porta la data 2026-11-27. Se pubblichi in un altro giorno, correggi la data nella riga `## [1.0.0] - 2026-11-27`, salva, e in GitHub Desktop premi **Commit to main** e poi **Push origin**.
2. Su GitHub vai in **Actions → Rilascio → Run workflow** e premi il pulsante verde **Run workflow**.
3. Aspetta la fine: costruisce i pacchetti per Windows, Linux e Mac e li avvia per provarli. Richiede dai 10 ai 20 minuti.
4. Vai in **Releases**: trovi la bozza «Ordine Rapido 1.0.0» con i file e le note.
5. Scarica il file per il tuo computer e provalo con i dati della cartella `esempi`.
6. Premi **Edit** sulla bozza e poi **Publish release**.

Da questo momento chiunque può scaricare l'app dalla pagina Releases.

**Questa è la prima volta che i pacchetti per Windows e Mac vengono costruiti e avviati.** Qui sono stati provati l'app, la versione portatile e il pacchetto Linux. Se il passo «Pacchetto per Windows» o «Pacchetto per Mac» si ferma, la bozza non viene creata: copia il messaggio di errore e fattelo spiegare prima di riprovare.

## 6. Sistema la pagina della repository

Nella pagina principale della repository, premi l'ingranaggio accanto ad **About** e inserisci:

- **Description:** `Trasforma gli ordini dei clienti in un file CSV per il gestionale, usando solo codici che esistono già.`
- **Topics:** `agenti-di-commercio`, `ordini`, `csv`, `gestionale`, `open-source`

In **Settings → General → Features** lascia attive le **Issues**: è da lì che arrivano segnalazioni e proposte.

In **Settings → Code security** attiva **Private vulnerability reporting**: permette di segnalarti in privato un problema di sicurezza, come indicato in `SECURITY.md`.

## Scelte già fatte, che puoi cambiare

| Scelta | Dove si cambia |
|---|---|
| Licenza GPL versione 3 «soltanto» (`GPL-3.0-only`), non «versione 3 o successive» | Campo `license` di `package.json`, intestazioni dei file in `app/` e `desktop/`, sezione Licenza del README |
| Titolare dei diritti: Roberto Murenu | `README.md`, intestazioni dei file, campo `author` e `build.copyright` di `package.json` |
| Prima versione pubblica: 1.0.0 | `package.json` e `CHANGELOG.md`; vedi [RILASCI.md](RILASCI.md) |
| Nome della repository: `ordine-rapido` | Al momento della creazione. I collegamenti interni sono relativi e funzionano con qualunque nome |
| Identificativo dell'app desktop: `it.ordinerapido.app` | `build.appId` in `package.json`. Va deciso **prima** del primo rilascio: cambiarlo dopo fa perdere gli archivi a chi ha già installato l'app |
| Modello proposto per la lettura: Claude Sonnet 5.5 | Costante `MODELS` in `src/anthropic/protocollo.ts` |

## Dopo la pubblicazione

- Per ogni modifica futura segui [RILASCI.md](RILASCI.md): numero di versione, voce nel registro, procedura **Rilascio**.
- Il primo lavoro consigliato è aggiornare la libreria che legge i file Excel: vedi [SECURITY.md](../SECURITY.md) e [SVILUPPO.md](SVILUPPO.md).
- Se un giorno un dato reale finisse per errore nella repository, toglierlo con una nuova modifica non basta: resta nella cronologia. In quel caso cambia subito le credenziali coinvolte e chiedi aiuto per riscrivere la cronologia.
