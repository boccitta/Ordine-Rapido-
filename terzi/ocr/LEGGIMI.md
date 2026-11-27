# Modelli per il riconoscimento dei caratteri

In questa cartella ci sono i modelli che l'app usa per leggere il testo di foto e scansioni **sul dispositivo**, senza inviare nulla. Sono file di terzi, copiati senza modifiche.

| File | Che cos'è | Dimensione | SHA-256 |
|---|---|---|---|
| `PP-OCRv6_tiny_det.ort` | Trova le righe di testo nell'immagine | 1,9 MB | `2816e82d26a09d6af722492f80f3059d458377c084eca88f34d84ddf9b385580` |
| `PP-OCRv6_tiny_rec.ort` | Legge i caratteri di ogni riga | 4,5 MB | `efc46adf1bde1e05b58748268abb0e71791bfa8616c435676bbca13d1ea47767` |
| `ppocrv6_tiny_dict.txt` | L'elenco dei caratteri che il modello conosce | 27 KB | `2f3717bbd530b681b6db3be35cc485e8a41a932b9558b833986bf0894eb21f2d` |

- **Che cosa sono.** I modelli PP-OCRv6 «tiny» del progetto [PaddleOCR](https://www.paddleocr.ai/), nel formato di ONNX Runtime (`.ort`).
- **Da dove vengono.** Dall'archivio [`snowfluke/ppu-paddle-ocr-models`](https://huggingface.co/snowfluke/ppu-paddle-ocr-models) su Hugging Face, lo stesso da cui li prende la libreria `ppu-paddle-ocr`: cartelle `detection/ort/` e `recognition/ort/`, più `recognition/ppocrv6_tiny_dict.txt`. Scaricati il 27 novembre 2026.
- **Licenza.** Apache License 2.0, la stessa di PaddleOCR. Il testo è in [`app/vendor/licenze/pdfjs-LICENSE.txt`](../../app/vendor/licenze/pdfjs-LICENSE.txt), che riporta la licenza Apache 2.0 per intero.

## Come finiscono nell'app

Una pagina aperta da disco non può leggere altri file, ma può caricare uno script. Per questo `npm run compila` mette in un solo file, `app/vendor/ocr/ocr-dati.js`, scritti in base64:

- il motore (`src/ocr/motore.ts` con le librerie `ppu-paddle-ocr` e `onnxruntime-web`, prese da `node_modules`);
- il WebAssembly di ONNX Runtime (`node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm`);
- i tre file di questa cartella.

Quel file pesa circa 28 MB, non sta nella repository e si rifà da solo quando cambia uno dei suoi ingredienti.

## Come aggiornarli

1. Scarica i file nuovi dallo stesso archivio e mettili qui al posto di quelli vecchi.
2. Aggiorna le impronte in questa tabella (`Get-FileHash` su Windows, `sha256sum` su Linux e Mac).
3. Esegui `npm run compila` e poi `node test/e2e.js`: la prova legge un buono d'ordine fotografato e controlla le righe.
