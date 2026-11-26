# Versioni e rilasci

Come si numera una versione, come si scrive il registro delle modifiche e come si pubblica.

## Il numero di versione

Formato `MAGGIORE.MINORE.CORREZIONE`, secondo il [versionamento semantico](https://semver.org/lang/it/). Per decidere quale cifra aumentare, guarda che cosa succede a chi aggiorna.

| Aumenta | Quando | Esempi |
|---|---|---|
| **MAGGIORE** `1.4.2 → 2.0.0` | Chi aggiorna deve fare qualcosa, altrimenti qualcosa smette di funzionare | Cambiano colonne, ordine o formati **iniziali** del CSV. Un archivio o una copia di sicurezza di prima non si legge più. Gli archivi salvati vanno ricaricati. Viene tolta una funzione |
| **MINORE** `1.4.2 → 1.5.0` | Arriva qualcosa di nuovo e tutto il resto continua a funzionare | Una colonna in più, spenta all'inizio. Un nuovo tipo di file letto. Una nuova opzione del tracciato |
| **CORREZIONE** `1.4.2 → 1.4.3` | Si sistema un errore, senza novità | Un calcolo sbagliato. Un testo. Un aggiornamento di sicurezza di una libreria |

Casi dubbi:

- Una colonna nuova **accesa** all'inizio cambia il file di chi usa il tracciato iniziale: è MAGGIORE. La stessa colonna **spenta** all'inizio è MINORE.
- Correggere un errore che qualcuno potrebbe aver compensato a mano, per esempio un arrotondamento, è una CORREZIONE ma va descritta con il prima e il dopo.
- I formati di riferimento sono in [FORMATI.md](FORMATI.md): se lo modifichi in modo incompatibile, è MAGGIORE.

Il numero sta in un solo posto: il campo `version` di `package.json`. Da lì lo prendono l'app (attraverso `app/versione.js`), i pacchetti e il rilascio.

## Il registro delle modifiche

Ogni modifica che cambia qualcosa per chi usa l'app va scritta in [CHANGELOG.md](../CHANGELOG.md), sotto «Non rilasciato», **nella stessa proposta di modifica che la introduce**.

Gruppi, sempre in quest'ordine: **Aggiunto**, **Modificato**, **Deprecato**, **Rimosso**, **Corretto**, **Sicurezza**. In fondo, se servono, **Limiti noti**.

Modello di una voce:

```markdown
#### Titolo breve che dice che cosa è cambiato

- **Che cosa cambia.** Il comportamento nuovo, con i nomi dei pulsanti e delle schermate così come si leggono nell'app.
- **Perché.** Il problema che c'era o il bisogno a cui risponde.
- **Che cosa devi fare.** I passi per chi aggiorna, oppure «Niente».
```

Regole:

1. Scrivi per chi usa l'app, non per chi la programma. Niente nomi di funzioni.
2. Se cambia il file esportato, mostra una riga di **prima** e una di **dopo**, con dati di fantasia.
3. Se cambia un formato di [FORMATI.md](FORMATI.md), aggiorna anche quella pagina.
4. Una voce per ogni modifica: non raggruppare cose diverse sotto «miglioramenti vari».
5. «Che cosa devi fare» non si omette mai. Se non c'è nulla da fare, scrivi «Niente».
6. Non riscrivere le sezioni delle versioni già pubblicate. Un errore si corregge con una voce nella versione successiva.

## Pubblicare una versione

### 1. Prepara

1. Decidi il numero nuovo con la tabella qui sopra.
2. In `package.json` cambia il campo `version`.
3. In `CHANGELOG.md` rinomina «Non rilasciato» in `## [X.Y.Z] - AAAA-MM-GG` con la data di oggi, apri sopra una nuova sezione «Non rilasciato» con la riga «Nessuna modifica in attesa.», aggiungi in apertura della versione un paragrafo «In breve» e aggiorna i due collegamenti in fondo al file.
4. Esegui:

   ```bash
   npm run versione     # scrive la versione nell'app e controlla che il registro abbia la sezione
   npm test             # prove e controllo dei dati
   ```

   Chi usa `npm version X.Y.Z` ottiene il passo 2 e `npm run versione` in un colpo solo.
5. Porta le modifiche sul ramo `main` e aspetta che le **Verifiche** su GitHub siano verdi.

### 2. Costruisci la bozza

Su GitHub: **Actions → Rilascio → Run workflow**, sul ramo `main`.

La procedura ripete le verifiche, costruisce i pacchetti per Windows, Linux e Mac, li avvia per provarli, costruisce la versione portatile e prepara una **bozza** di rilascio con i file e con le note prese dal registro. Si ferma, spiegando perché, se:

- una prova fallisce o il controllo trova dati reali;
- `package.json`, app e registro non riportano la stessa versione;
- quella versione è già stata pubblicata;
- un pacchetto non si avvia.

La casella «Salta la prova dei pacchetti desktop» serve solo se è la prova stessa a essere guasta, non per aggirare un pacchetto che non parte.

### 3. Controlla e pubblica

1. Apri **Releases**: trovi la bozza «Ordine Rapido X.Y.Z».
2. Scarica almeno il file per il tuo sistema e provalo davvero con i dati di `esempi/`.
3. Premi **Publish release**. In quel momento GitHub crea l'etichetta `vX.Y.Z` e la versione diventa pubblica.

I file di una versione pubblicata non si sostituiscono. Se scopri un errore, pubblica una CORREZIONE.

### File di un rilascio

| File | Contenuto |
|---|---|
| `Ordine-Rapido.html` | Versione portatile, tutta l'app in un file |
| `Ordine-Rapido-X.Y.Z-windows-installazione.exe` | Installazione per Windows a 64 bit |
| `Ordine-Rapido-X.Y.Z-windows-portatile.exe` | Windows a 64 bit, senza installazione |
| `Ordine-Rapido-X.Y.Z-linux-x86_64.AppImage` | Linux a 64 bit |
| `Ordine-Rapido-X.Y.Z-mac-arm64.dmg` | Mac con processore Apple |
| `Ordine-Rapido-X.Y.Z-mac-x64.dmg` | Mac con processore Intel |
| `SHA256SUMS.txt` | Impronte di tutti i file |

Il nome della versione portatile non contiene il numero di proposito: chi aggiorna sostituisce il file nella stessa cartella e ritrova i propri dati.
