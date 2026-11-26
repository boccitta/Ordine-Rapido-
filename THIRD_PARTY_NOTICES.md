# Componenti di terzi

Ordine Rapido è distribuito con licenza GNU GPL versione 3 (vedi [LICENSE](LICENSE)). Per funzionare da solo include alcuni componenti di altri autori, che mantengono le proprie licenze. Tutte sono compatibili con la GPL versione 3.

## Inclusi nell'app

Si trovano in `app/vendor/`, copiati senza modifiche. Versione, origine e impronta SHA-256 di ogni file sono in [`app/vendor/VENDOR.json`](app/vendor/VENDOR.json).

| Componente | Versione | A cosa serve | Licenza | Testo della licenza |
|---|---|---|---|---|
| [PDF.js](https://github.com/mozilla/pdf.js) (pdfjs-dist), Mozilla Foundation | 3.11.174 | Leggere i file PDF | Apache License 2.0 | [`pdfjs-LICENSE.txt`](app/vendor/licenze/pdfjs-LICENSE.txt) |
| SheetJS Community Edition (xlsx), SheetJS LLC | 0.18.5 | Leggere i file Excel | Apache License 2.0 | [`sheetjs-LICENSE.txt`](app/vendor/licenze/sheetjs-LICENSE.txt) |
| [Figtree](https://github.com/erikdkennedy/figtree), The Figtree Project Authors | 5.3.0 (pacchetto Fontsource) | Carattere dei testi | SIL Open Font License 1.1 | [`figtree-OFL.txt`](app/vendor/licenze/figtree-OFL.txt) |
| [Montserrat](https://github.com/JulietaUla/Montserrat), The Montserrat Project Authors | 5.3.0 (pacchetto Fontsource) | Carattere dei titoli | SIL Open Font License 1.1 | [`montserrat-OFL.txt`](app/vendor/licenze/montserrat-OFL.txt) |

La versione portatile `Ordine-Rapido.html` contiene gli stessi componenti dentro il file.

## Inclusi solo nei pacchetti desktop

| Componente | A cosa serve | Licenza |
|---|---|---|
| [Electron](https://github.com/electron/electron), OpenJS Foundation e collaboratori | La finestra dell'app su Windows, Linux e Mac | MIT |
| Chromium e gli altri componenti distribuiti con Electron | Motore della finestra | Varie licenze libere: l'elenco completo è nel file `LICENSES.chromium.html` dentro ogni pacchetto |

## Usati solo per costruire e provare

Non vengono distribuiti con l'app: [electron-builder](https://github.com/electron-userland/electron-builder) (MIT) per creare i pacchetti e [Playwright](https://github.com/microsoft/playwright) (Apache License 2.0) per le prove.

## Nomi e marchi

GesACom, Excel, Windows, macOS, Claude e gli altri nomi di prodotti citati appartengono ai rispettivi proprietari. Ordine Rapido è un progetto indipendente e non è affiliato a nessuno di loro.
