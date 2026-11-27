/*
 * Ordine Rapido - custodia delle chiavi API nell'app desktop, una per servizio (Anthropic, Google, OpenAI).
 * Le chiavi vivono solo nel processo principale. Se l'utente chiede di ricordarle vengono scritte su disco cifrate
 * dal sistema operativo (portachiavi di Windows, macOS o Linux); se il sistema non offre un portachiavi non vengono
 * scritte affatto e valgono fino alla chiusura dell'app. In chiaro su disco non finiscono mai.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { safeStorage } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PROVIDER_IDS } from '../ia/indice.ts';
import type { ProviderId } from '../ia/indice.ts';
import type { KeyState, KeyStates } from './contratto.ts';

/* Il file di ogni chiave. Quella di Anthropic tiene il nome delle versioni precedenti, così chi aggiorna non la perde. */
const FILE: Readonly<Record<ProviderId, string>> = { anthropic: 'chiave-api.bin', gemini: 'chiave-gemini.bin', openai: 'chiave-openai.bin' };

/** true se il sistema può cifrare davvero. Su Linux senza portachiavi Electron userebbe una password fissa: non conta. */
function canEncrypt(): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
    return true;
  } catch { return false; }
}

/** La chiave di un servizio. */
class Vault {
  private current = '';
  private stored = false;
  private readonly file: string;
  constructor(file: string) { this.file = file; }

  /** Legge la chiave salvata, se c'è. Un file che non si riesce più a decifrare viene tolto. */
  load(): void {
    try {
      if (!fs.existsSync(this.file) || !canEncrypt()) return;
      this.current = safeStorage.decryptString(fs.readFileSync(this.file));
      this.stored = !!this.current;
    } catch { this.current = ''; this.stored = false; this.erase(); }
  }
  get(): string { return this.current; }
  state(): KeyState { return { present: !!this.current, hint: this.current ? this.current.slice(-4) : '', stored: this.stored, canEncrypt: canEncrypt() }; }
  set(key: string, remember: boolean): void { this.current = key; this.persist(remember); }
  /** La scrive su disco solo se richiesto e solo cifrata. */
  persist(remember: boolean): void {
    if (!remember || !this.current || !canEncrypt()) { this.erase(); return; }
    try {
      const tmp = this.file + '.tmp';
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, safeStorage.encryptString(this.current), { mode: 0o600 });
      fs.renameSync(tmp, this.file);
      this.stored = true;
    } catch { this.erase(); }
  }
  forget(): void { this.current = ''; this.erase(); }
  private erase(): void {
    this.stored = false;
    for (const f of [this.file, this.file + '.tmp']) { try { fs.rmSync(f, { force: true }); } catch { /* già assente */ } }
  }
}

export class KeyVault {
  private readonly vaults = {} as Record<ProviderId, Vault>;
  constructor(dataDir: string) {
    for (const id of PROVIDER_IDS) this.vaults[id] = new Vault(path.join(dataDir, FILE[id]));
  }
  load(): void { for (const id of PROVIDER_IDS) this.vaults[id].load(); }
  get(id: ProviderId): string { return this.vaults[id].get(); }
  set(id: ProviderId, key: string, remember: boolean): void { this.vaults[id].set(key, remember); }
  /** Ricordare o no vale per tutte le chiavi. */
  persist(remember: boolean): void { for (const id of PROVIDER_IDS) this.vaults[id].persist(remember); }
  forget(id: ProviderId): void { this.vaults[id].forget(); }
  states(): KeyStates {
    const out = {} as KeyStates;
    for (const id of PROVIDER_IDS) out[id] = this.vaults[id].state();
    return out;
  }
}
