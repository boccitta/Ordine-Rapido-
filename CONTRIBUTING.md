# Contribuire

Segnalazioni, idee e correzioni sono benvenute. Non serve essere programmatori: anche dire «con il mio gestionale il file dovrebbe essere fatto così» aiuta.

## La regola che viene prima di tutte

**Nessun dato reale, mai.** Né nel codice, né nelle prove, né nelle segnalazioni, né nelle immagini.

- Non allegare ordini veri, esportazioni del gestionale, listini o copie di sicurezza dell'app.
- Per mostrare un problema usa i file della cartella [`esempi/`](esempi/), oppure riscrivi il caso con nomi e numeri inventati.
- Nelle schermate, controlla che non si leggano clienti, prezzi o chiavi.

Quello che viene pubblicato su GitHub resta pubblico, anche se poi viene cancellato.

## Segnalare un errore o proporre un'idea

Apri una segnalazione dalla scheda **Issues** e scegli il modello adatto. Per un errore servono:

- la versione dell'app, scritta accanto al nome in alto a sinistra;
- come la usi: versione portatile e con quale browser, oppure app desktop e su quale sistema;
- che cosa hai fatto, che cosa ti aspettavi e che cosa è successo;
- se riguarda il file esportato, una riga di esempio con dati inventati.

Per un problema di sicurezza non aprire una segnalazione pubblica: segui [SECURITY.md](SECURITY.md).

## Proporre una modifica al codice

1. Leggi [docs/SVILUPPO.md](docs/SVILUPPO.md): spiega com'è fatta l'app e come provarla.
2. Per le modifiche grandi apri prima una segnalazione, così se ne parla prima di scrivere codice.
3. Lavora su un ramo tuo e apri una richiesta di integrazione verso `main`.

Una richiesta è pronta quando:

- [ ] `npm test` passa: prove e controllo dei dati;
- [ ] `npm run tipi` passa: il controllo dei tipi non segnala errori;
- [ ] la logica nuova sta in `src/core/` e ha la sua prova in `test/` (`core`, `modello`, `lettura`, `ricette` o `ia`);
- [ ] il registro delle modifiche ha la voce, sotto «Non rilasciato», con le tre risposte: che cosa cambia, perché, che cosa devi fare ([docs/RILASCI.md](docs/RILASCI.md));
- [ ] se cambia un formato, [docs/FORMATI.md](docs/FORMATI.md) è aggiornato;
- [ ] non compaiono nuovi indirizzi di rete, nuove librerie o nuovi dati salvati senza che la richiesta lo dica chiaramente.

Il numero di versione non si tocca nelle richieste: lo decide chi pubblica il rilascio.

## Che cosa non cambia

Alcune scelte sono il motivo per cui l'app esiste. Una proposta che le indebolisce difficilmente verrà accolta:

- nel file finiscono solo codici presenti nell'archivio, salvo che l'utente tolga il blocco di proposito;
- l'app funziona da sola, senza server e senza account;
- gli archivi restano sul dispositivo di chi la usa;
- l'app non raccoglie statistiche d'uso.

## Licenza dei contributi

Il progetto è distribuito con licenza GNU GPL versione 3. Inviando un contributo accetti che venga distribuito con la stessa licenza e dichiari di avere il diritto di farlo.
