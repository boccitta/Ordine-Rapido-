/*
 * Ordine Rapido - custodia della chiave API nell'app desktop.
 * La chiave vive solo nel processo principale. Se l'utente chiede di ricordarla viene scritta su disco cifrata
 * dal sistema operativo (portachiavi di Windows, macOS o Linux); se il sistema non offre un portachiavi non
 * viene scritta affatto e vale fino alla chiusura dell'app. In chiaro su disco non finisce mai.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { safeStorage } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KeyState } from './contratto.ts';

export class KeyVault {
  private current = '';
  private stored = false;
  private readonly file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'chiave-api.bin');
  }

  /** true se il sistema può cifrare davvero. Su Linux senza portachiavi Electron userebbe una password fissa: non conta. */
  canEncrypt(): boolean {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
      return true;
    } catch { return false; }
  }

  /** Legge la chiave salvata, se c'è. Un file che non si riesce più a decifrare viene tolto. */
  load(): void {
    try {
      if (!fs.existsSync(this.file)) return;
      if (!this.canEncrypt()) return;
      this.current = safeStorage.decryptString(fs.readFileSync(this.file));
      this.stored = !!this.current;
    } catch {
      this.current = ''; this.stored = false;
      this.erase();
    }
  }

  get(): string { return this.current; }

  state(): KeyState {
    return { present: !!this.current, hint: this.current ? this.current.slice(-4) : '', stored: this.stored, canEncrypt: this.canEncrypt() };
  }

  /** Tiene la chiave; la scrive su disco solo se richiesto e solo cifrata. */
  set(key: string, remember: boolean): void {
    this.current = key;
    this.persist(remember);
  }

  persist(remember: boolean): void {
    if (!remember || !this.current || !this.canEncrypt()) { this.erase(); return; }
    try {
      const tmp = this.file + '.tmp';
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, safeStorage.encryptString(this.current), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
      this.stored = true;
    } catch { this.erase(); }
  }

  forget(): void {
    this.current = '';
    this.erase();
  }

  private erase(): void {
    this.stored = false;
    for (const f of [this.file, this.file + '.tmp']) { try { fs.rmSync(f, { force: true }); } catch { /* già assente */ } }
  }
}
