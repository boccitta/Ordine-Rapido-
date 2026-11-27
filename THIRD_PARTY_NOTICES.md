# Componenti di terzi

Ordine Rapido è distribuito con licenza GNU GPL versione 3 (vedi [LICENSE](LICENSE)). Per funzionare da solo include alcuni componenti di altri autori, che mantengono le proprie licenze. Tutte sono compatibili con la GPL versione 3.

## Inclusi nell'app

Si trovano in `app/vendor/`, copiati senza modifiche. Versione, origine e impronta SHA-256 di ogni file sono in [`app/vendor/VENDOR.json`](app/vendor/VENDOR.json).

| Componente | Versione | A cosa serve | Licenza | Testo della licenza |
|---|---|---|---|---|
| [PDF.js](https://github.com/mozilla/pdf.js) (pdfjs-dist), Mozilla Foundation | 3.11.174 | Leggere i file PDF | Apache License 2.0 | [`pdfjs-LICENSE.txt`](app/vendor/licenze/pdfjs-LICENSE.txt) |
| SheetJS Community Edition (xlsx), SheetJS LLC | 0.20.3 | Leggere i file Excel | Apache License 2.0 | [`sheetjs-LICENSE.txt`](app/vendor/licenze/sheetjs-LICENSE.txt) |
| [Figtree](https://github.com/erikdkennedy/figtree), The Figtree Project Authors | 5.3.0 (pacchetto Fontsource) | Carattere dei testi | SIL Open Font License 1.1 | [`figtree-OFL.txt`](app/vendor/licenze/figtree-OFL.txt) |
| [Montserrat](https://github.com/JulietaUla/Montserrat), The Montserrat Project Authors | 5.3.0 (pacchetto Fontsource) | Carattere dei titoli | SIL Open Font License 1.1 | [`montserrat-OFL.txt`](app/vendor/licenze/montserrat-OFL.txt) |

La versione portatile `Ordine-Rapido.html` contiene gli stessi componenti dentro il file.

### Riconoscimento dei caratteri per foto e scansioni

Servono a leggere sul dispositivo il testo di foto e scansioni. `npm run compila` li riunisce in `app/vendor/ocr/ocr-dati.js`; non sono nella versione portatile in un solo file.

| Componente | Versione | A cosa serve | Licenza | Testo della licenza |
|---|---|---|---|---|
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (onnxruntime-web), Microsoft Corporation | 1.31.1 | Esegue i modelli in WebAssembly | MIT | [`onnxruntime-LICENSE.txt`](app/vendor/licenze/onnxruntime-LICENSE.txt) |
| [ppu-paddle-ocr](https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr), PT. Perkasa Pilar Utama | 6.7.1 | Prepara le immagini e ricompone il testo | MIT | [`ppu-paddle-ocr-LICENSE.txt`](app/vendor/licenze/ppu-paddle-ocr-LICENSE.txt) |
| [ppu-ocv](https://github.com/PT-Perkasa-Pilar-Utama/ppu-ocv), PT. Perkasa Pilar Utama | quella richiesta da ppu-paddle-ocr | Elaborazione delle immagini | MIT | [`ppu-ocv-LICENSE.txt`](app/vendor/licenze/ppu-ocv-LICENSE.txt) |
| Modelli PP-OCRv6 «tiny» di [PaddleOCR](https://www.paddleocr.ai/), PaddlePaddle Authors | file in [`terzi/ocr/`](terzi/ocr/LEGGIMI.md) | Trovano e leggono il testo nell'immagine | Apache License 2.0 | [`pdfjs-LICENSE.txt`](app/vendor/licenze/pdfjs-LICENSE.txt) (testo della licenza Apache 2.0) |

## Inclusi solo nei pacchetti desktop

| Componente | A cosa serve | Licenza |
|---|---|---|
| [Electron](https://github.com/electron/electron), OpenJS Foundation e collaboratori | La finestra dell'app su Windows, Linux e Mac | MIT |
| Chromium e gli altri componenti distribuiti con Electron | Motore della finestra | Varie licenze libere: l'elenco completo è nel file `LICENSES.chromium.html` dentro ogni pacchetto |

## Usati solo per costruire e provare

Non vengono distribuiti con l'app: [electron-builder](https://github.com/electron-userland/electron-builder) (MIT) per creare i pacchetti e [Playwright](https://github.com/microsoft/playwright) (Apache License 2.0) per le prove.

## Nomi e marchi

GesACom, Excel, Windows, macOS, Claude e gli altri nomi di prodotti citati appartengono ai rispettivi proprietari. Ordine Rapido è un progetto indipendente e non è affiliato a nessuno di loro.
