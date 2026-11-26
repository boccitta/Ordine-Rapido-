# Dati di esempio

Tutto quello che c'è in questa cartella è **inventato**. Serve a provare Ordine Rapido senza usare dati propri, ed è l'unico tipo di dato ammesso nella repository.

| File | Che cos'è | Come si usa |
|---|---|---|
| `articoli-esempio.csv` | 16 articoli di due mandanti | **Archivio → Carica export articoli** |
| `clienti-esempio.csv` | 6 clienti | **Archivio → Carica export clienti** |
| `mandanti-esempio.csv` | 2 case mandanti | **Archivio → Carica export mandanti** |
| `ordine-esempio.pdf` | Un ordine di 5 righe, con una riga omaggio | Trascinalo nell'app e premi **Leggi ordine** (serve la chiave API) |
| `ordine-esempio-messaggio.txt` | Lo stesso ordine scritto come messaggio | Copia il testo e incollalo nel riquadro del messaggio |

Senza chiave API puoi comunque premere **Prova con un ordine di esempio**: è lo stesso ordine del PDF, già trascritto.

## Perché questi dati non possono essere reali

- Le aziende, gli indirizzi e i prezzi sono di fantasia.
- Le **partite IVA** hanno la cifra di controllo sbagliata: nessuna azienda può averle.
- I **codici a barre** iniziano con 20, un prefisso riservato all'uso interno dei negozi: non identificano nessun prodotto in commercio.

Le prove automatiche verificano entrambe le cose. Chi aggiunge un esempio deve costruirlo allo stesso modo.
