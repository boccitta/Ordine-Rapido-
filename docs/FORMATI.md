# Formati

Questa pagina descrive i tre formati che Ordine Rapido legge e scrive. Sono la parte «pubblica» dell'app: una modifica che li rende incompatibili richiede una nuova versione MAGGIORE (vedi [RILASCI.md](RILASCI.md)).

## 1. Il file esportato per il gestionale

Un file CSV con una riga per ogni riga d'ordine. Le colonne di testata sono ripetute su ogni riga.

### Impostazioni iniziali

| Impostazione | Valore iniziale | Alternative |
|---|---|---|
| Separatore | punto e virgola `;` | virgola, tabulazione, barra verticale |
| Decimali | virgola `7,20` | punto `7.20` |
| Date | `23/11/2026` | `2026-11-23`, `23112026` |
| Codifica | Windows (ANSI, Windows-1252) | UTF-8 con BOM |
| Prima riga con i nomi delle colonne | sì | no |
| Fine riga | CRLF | — |
| Unità di misura se manca | `PZ` | testo libero |
| Righe omaggio | sconto 100 % | prezzo 0, oppure solo colonna Omaggio |
| Descrizione articolo | quella dell'archivio | quella del documento del cliente |

I testi che contengono il separatore, le virgolette o un a capo sono racchiusi tra virgolette doppie, con le virgolette interne raddoppiate. Nella codifica Windows i caratteri che non esistono in quella tabella diventano `?`.

### Colonne

Ogni colonna si può accendere, spegnere, spostare e rinominare da **Impostazioni → Tracciato del file**. Le intestazioni qui sotto sono quelle iniziali.

| Intestazione | Contenuto | Tipo | Attiva all'inizio |
|---|---|---|---|
| `CodArticolo` | Codice articolo della mandante, preso dall'archivio | riga | sì |
| `Descrizione` | Descrizione | riga | sì |
| `Unimis` | Unità di misura | riga | sì |
| `Quantita` | Quantità | riga | sì |
| `Colli` | Colli | riga | sì |
| `Prezzo` | Prezzo unitario lordo | riga | sì |
| `Sconto1` | Sconto 1 % | riga | sì |
| `Sconto2` | Sconto 2 % | riga | sì |
| `Sconto3` | Sconto 3 % | riga | no |
| `Omaggio` | `S` oppure `N` | riga | sì |
| `PrezzoNetto` | Prezzo dopo gli sconti | riga | no |
| `Totale` | Totale riga | riga | no |
| `CodArtCliente` | Codice articolo usato dal cliente | riga | no |
| `EAN` | Codice a barre | riga | no |
| `NotaRiga` | Nota della riga | riga | no |
| `NumOrdine` | Numero d'ordine del cliente | testata | sì |
| `DataOrdine` | Data dell'ordine | testata | sì |
| `DataConsegna` | Consegna richiesta | testata | sì |
| `CodCliente` | Codice cliente, preso dall'archivio | testata | sì |
| `Cliente` | Ragione sociale del cliente | testata | sì |
| `PIvaCliente` | Partita IVA del cliente | testata | sì |
| `CodMandante` | Codice mandante, preso dall'archivio | testata | sì |
| `Mandante` | Casa mandante | testata | sì |
| `Pagamento` | Condizioni di pagamento | testata | sì |
| `Destinazione` | Destinazione della merce | testata | sì |
| `Note` | Note dell'ordine | testata | sì |

I due pulsanti rapidi del tracciato sono **Solo righe**, che spegne le colonne di testata, e **Testata + righe**, che le mette per prime.

### Numeri

| Dato | Decimali |
|---|---|
| Quantità e colli | da 0 a 3 |
| Prezzo e prezzo netto | da 2 a 5 |
| Sconti | da 0 a 2 |
| Totale riga | 2 |

### Nome del file

`ordine_<mandante>_<cliente>_<numero>_<data>.csv`, senza accenti e con i trattini al posto di spazi e simboli. Esempio: `ordine_CONSERVE-FANTASIA-S-P-A_MARKET-FANTASIA-S-R-L_2026-0412_2026-11-23.csv`.

### Righe copiate

**Copia righe** mette negli appunti le stesse colonne separate da tabulazione, pronte da incollare dove il gestionale accetta righe da Excel.

## 2. Gli archivi da caricare

File CSV, TXT o Excel (`.xlsx`, `.xls`) esportati dal gestionale. Per i file di testo il separatore viene riconosciuto da solo tra punto e virgola, tabulazione, virgola e barra verticale; la codifica può essere UTF-8 o Windows. Di un file Excel viene letto il foglio con più righe.

Le colonne vengono riconosciute dalle intestazioni e si possono correggere a mano prima di salvare. Le righe senza codice vengono scartate.

| Archivio | Campo | Obbligatorio | Intestazioni riconosciute |
|---|---|---|---|
| Articoli | Codice articolo | sì | contiene `cod`, `art` o `sku` |
| Articoli | Descrizione | no | contiene `descr` |
| Articoli | EAN | no | contiene `ean`, `barcode` o `barre` |
| Articoli | Unità di misura | no | `UM`, `U.M.`, `Unimis`, `Unità di misura` |
| Articoli | Casa mandante | no | contiene `mandante`, `fornitore`, `ditta`, `marca` o `casa` |
| Articoli | Prezzo di listino | no | contiene `prezzo` o `listino` |
| Clienti | Codice cliente | sì | contiene `cod` |
| Clienti | Ragione sociale | no | contiene `ragione`, `denominaz`, `nominativo`, `nome` o `cliente` |
| Clienti | Partita IVA | no | contiene `p.iva` o `partita` |
| Mandanti | Codice mandante | sì | contiene `cod` |
| Mandanti | Ragione sociale | no | contiene `ragione`, `denominaz`, `nominativo`, `nome`, `mandante`, `fornitore`, `ditta` o `casa` |
| Mandanti | Partita IVA | no | contiene `p.iva` o `partita` |

Se il file degli articoli non ha la colonna della mandante, si può indicare una mandante unica per tutto il file. Due articoli sono lo stesso articolo se hanno stesso codice e stessa mandante; clienti e mandanti sono identificati dal solo codice.

Esempi pronti: [`esempi/`](../esempi/).

## 3. La copia di sicurezza

Un file JSON chiamato `ordine-rapido-archivio_AAAA-MM-GG.json`.

```json
{
  "formato": "ordine-rapido-archivio",
  "versione_formato": 1,
  "app": "1.0.0",
  "creato_il": "2026-11-26",
  "tracciato": { "sep": ";", "dec": ",", "cols": [] },
  "abbinamenti": { "chiave": "codice articolo" },
  "art": { "aggiornato_il": "2026-11-26", "campi": ["cod", "desc", "ean", "um", "mand", "prezzo"], "righe": [["300101", "PASSATA…", "2000003001019", "PZ", "CONSERVE FANTASIA S.P.A.", "0,85"]] },
  "cli": { "aggiornato_il": "2026-11-26", "campi": ["cod", "nome", "piva"], "righe": [] },
  "man": { "aggiornato_il": "2026-11-26", "campi": ["cod", "nome", "piva"], "righe": [] }
}
```

- `versione_formato` è il numero del formato, non dell'app. L'app legge tutte le versioni fino alla propria e rifiuta, spiegandolo, una copia creata con un formato più recente.
- `campi` dichiara l'ordine dei valori in ogni riga, così un campo aggiunto in futuro non rompe la lettura delle copie vecchie.
- `tracciato` è il tracciato del file esportato; i campi mancanti prendono il valore iniziale.
- La chiave API non è mai compresa.

La copia contiene dati reali: va conservata con cura e non va mai messa nella repository. Il file `.gitignore` e il controllo dei dati la escludono.
