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
- **Un solo indirizzo di rete.** La pagina dichiara una Content Security Policy che permette collegamenti soltanto verso `api.anthropic.com`. L'app desktop aggiunge un blocco sulle richieste di rete della finestra, apre nel browser solo collegamenti verso un elenco di siti previsti e rifiuta le richieste di fotocamera, microfono, posizione e notifiche.
- **Che cosa esce.** Solo quando si usa la lettura automatica: il testo e le immagini del documento dell'ordine e, per i suggerimenti di abbinamento, le righe non trovate con al massimo dieci articoli candidati ciascuna. Gli archivi interi non vengono mai inviati.
- **Chiave API.** Resta nelle impostazioni dell'app sul dispositivo. Non entra negli archivi, nelle copie di sicurezza né nel file esportato, e viene inviata soltanto ad Anthropic.
- **Contenuti non fidati.** Tutto ciò che arriva da un documento o da un archivio viene mostrato come testo, mai interpretato come HTML. La libreria dei PDF è usata con l'esecuzione di codice dai documenti disattivata.
- **Il modello non decide i codici.** La risposta del modello è trattata come un dato da controllare: un codice entra nel file solo se esiste nell'archivio caricato dall'utente.

## Limiti da conoscere

### La chiave API e gli archivi sono salvati in chiaro

Chiunque abbia accesso al tuo computer con il tuo utente può leggerli. Non usare l'app con la tua chiave su un computer condiviso; in quel caso togli la spunta da «Ricorda la chiave su questo dispositivo». Nella Console di Anthropic conviene creare una chiave dedicata a Ordine Rapido e impostare un limite di spesa: se venisse copiata, la puoi revocare senza toccare le altre.

### La versione portatile condivide lo spazio del browser

`Ordine-Rapido.html` salva i dati nel browser. In alcuni browser tutte le pagine aperte dal disco condividono lo stesso spazio: un altro file HTML aperto dal tuo computer con lo stesso browser potrebbe leggere chiave e archivi. Apri solo file HTML di cui ti fidi. L'app desktop non ha questo limite, perché tiene i dati in uno spazio proprio.

### Libreria Excel con vulnerabilità note

L'app include SheetJS Community Edition 0.18.5, l'ultima versione distribuita sul registro npm. Ha due vulnerabilità note, che riguardano l'apertura di file Excel costruiti apposta:

- CVE-2023-30533, corretta dalla versione 0.19.3;
- CVE-2024-22363, corretta dalla versione 0.20.2.

Le versioni corrette sono distribuite solo dal sito del produttore. Finché la libreria non viene aggiornata, **apri solo file Excel di cui conosci la provenienza**, oppure fatti mandare l'ordine in PDF o CSV. La Content Security Policy limita comunque le conseguenze: la pagina non può inviare dati ad altri indirizzi. La procedura di aggiornamento è in [docs/SVILUPPO.md](docs/SVILUPPO.md).

### Libreria PDF

L'app include pdf.js 3.11.174, che ha una vulnerabilità nota (CVE-2024-4367) corretta nelle versioni successive. L'app usa la contromisura indicata per quella versione, `isEvalSupported: false`, che disattiva la funzione coinvolta.

### Pacchetti non firmati

I pacchetti per Windows e Mac non hanno una firma digitale rilasciata da un'autorità: il sistema non può confermare chi li ha prodotti e mostra un avviso al primo avvio. Scaricali solo dalla pagina Releases di questa repository e, se vuoi, confrontane l'impronta con quella in `SHA256SUMS.txt`.

### Nessun aggiornamento automatico

L'app non controlla da sola se esistono versioni nuove. Le correzioni di sicurezza vanno scaricate dalla pagina Releases.
