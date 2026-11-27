# Sicurezza

## Segnalare un problema

Se trovi un problema di sicurezza, **non aprire una segnalazione pubblica**. Usa la segnalazione privata di GitHub: nella repository, scheda **Security → Report a vulnerability**.

Descrivi che cosa hai trovato e come riprodurlo. Non allegare ordini, archivi o chiavi reali: bastano i dati della cartella `esempi/` o dati inventati.

Lo stesso vale se trovi nella repository, o nella sua cronologia, un dato che sembra reale: una chiave, un cliente, un listino. Segnalalo in privato senza riportarne il contenuto.

Il progetto è mantenuto da volontari: le segnalazioni vengono lette e trattate appena possibile, senza tempi garantiti.

## Versioni seguite

Le correzioni di sicurezza arrivano solo sull'ultima versione pubblicata.

## Come l'app protegge i dati

- **Nessun server.** L'app gira sul dispositivo di chi la usa. Non esistono un servizio centrale, un account o una raccolta di statistiche.
- **Un solo indirizzo di rete.** La pagina dichiara una Content Security Policy che permette collegamenti soltanto verso `api.anthropic.com`. Nell'app desktop dalla finestra non parte nessuna richiesta di rete, nemmeno verso Anthropic: a parlare con il servizio è il processo principale, da una sessione di rete dedicata da cui si raggiunge solo quell'indirizzo. La finestra apre nel browser solo collegamenti verso un elenco di siti previsti e rifiuta le richieste di fotocamera, microfono, posizione e notifiche.
- **Che cosa esce.** Solo quando si usa la lettura automatica: il testo e le immagini del documento dell'ordine e, per i suggerimenti di abbinamento, le righe non trovate con al massimo dieci articoli candidati ciascuna. Gli archivi interi non vengono mai inviati.
- **Chiave API.** Non entra negli archivi, nelle copie di sicurezza né nel file esportato, e viene inviata soltanto ad Anthropic. Nell'app desktop è custodita dal processo principale: la finestra la consegna una volta e non può più rileggerla; se scegli di ricordarla viene scritta su disco cifrata dal sistema operativo (protezione dati di Windows, Portachiavi di macOS, portachiavi di Linux).
- **Finestra isolata.** Nell'app desktop la pagina non ha accesso a Node, al disco o al sistema: può chiedere al processo principale solo le operazioni di un elenco chiuso (chiave, lettura, archivi), e il processo principale risponde solo alla pagina dell'app.
- **Contenuti non fidati.** Tutto ciò che arriva da un documento o da un archivio viene mostrato come testo, mai interpretato come HTML. La libreria dei PDF è usata con l'esecuzione di codice dai documenti disattivata.
- **Il modello non decide i codici.** La risposta del modello è trattata come un dato da controllare: un codice entra nel file solo se esiste nell'archivio caricato dall'utente.

## Limiti da conoscere

### Gli archivi sono salvati in chiaro; la chiave API è cifrata solo nell'app desktop

Gli archivi (articoli, clienti, mandanti) sono salvati senza cifratura: chiunque abbia accesso al tuo computer con il tuo utente può leggerli. Lo stesso vale per l'ordine in lavorazione, che l'app salva a ogni modifica per non fartelo perdere: resta sul dispositivo finché non premi **Nuovo ordine**.

La chiave API dipende da come usi l'app:

- **app desktop**: è cifrata dal sistema operativo con le credenziali del tuo utente. La protegge da chi copia i file o il disco, non da un programma che gira con il tuo utente. Su un Linux senza portachiavi l'app non la scrive su disco: va inserita a ogni avvio;
- **versione portatile** (`Ordine-Rapido.html`): un browser non offre un posto protetto, quindi la chiave resta in chiaro tra i dati del browser.

Non usare l'app con la tua chiave su un computer condiviso; in quel caso togli la spunta da «Ricorda la chiave su questo dispositivo». Nella Console di Anthropic conviene creare una chiave dedicata a Ordine Rapido e impostare un limite di spesa: se venisse copiata, la puoi revocare senza toccare le altre.

### La versione portatile condivide lo spazio del browser

`Ordine-Rapido.html` salva i dati nel browser. In alcuni browser tutte le pagine aperte dal disco condividono lo stesso spazio: un altro file HTML aperto dal tuo computer con lo stesso browser potrebbe leggere chiave e archivi. Apri solo file HTML di cui ti fidi. L'app desktop non ha questo limite, perché tiene i dati in uno spazio proprio.

### Libreria Excel

L'app include SheetJS Community Edition 0.20.3, che corregge le due vulnerabilità note delle versioni precedenti (CVE-2023-30533 e CVE-2024-22363), legate all'apertura di file Excel costruiti apposta. Dalla 0.18.5 in poi il produttore distribuisce le versioni nuove solo dal proprio sito, non dal registro npm: gli aggiornamenti vanno quindi cercati lì. La procedura è in [docs/SVILUPPO.md](docs/SVILUPPO.md).

### Libreria PDF

L'app include pdf.js 3.11.174, che ha una vulnerabilità nota (CVE-2024-4367) corretta nelle versioni successive. L'app usa la contromisura indicata per quella versione, `isEvalSupported: false`, che disattiva la funzione coinvolta.

### Pacchetti non firmati

I pacchetti per Windows e Mac non hanno una firma digitale rilasciata da un'autorità: il sistema non può confermare chi li ha prodotti e mostra un avviso al primo avvio. Scaricali solo dalla pagina Releases di questa repository e, se vuoi, confrontane l'impronta con quella in `SHA256SUMS.txt`.

Su Windows 11 con **Smart App Control** attivo non c'è solo un avviso: il sistema blocca i programmi non firmati e non offre un modo per proseguire. Su quei computer l'app desktop non parte finché i pacchetti non vengono firmati con un certificato di firma del codice; resta utilizzabile la versione portatile `Ordine-Rapido.html`, che si apre nel browser. Smart App Control è una protezione del sistema: non conviene disattivarla per far partire un programma.

### Nessun aggiornamento automatico

L'app non controlla da sola se esistono versioni nuove. Le correzioni di sicurezza vanno scaricate dalla pagina Releases.
