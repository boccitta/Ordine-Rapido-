/*
 * Ordine Rapido - archivi su disco nell'app desktop.
 * Ogni archivio è un file JSON nella cartella dati dell'app. La scrittura avviene su un file provvisorio che
 * solo alla fine prende il posto di quello valido: un'interruzione a metà non rovina l'archivio già salvato.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Kind } from '../core/tipi.ts';
import type { StoredArchive, StoredArchives } from './contratto.ts';

const FORMAT = 'ordine-rapido-archivio-locale';
const VERSION = 1;
const KINDS: readonly Kind[] = ['art', 'cli', 'man'];
/** Oltre questa dimensione un archivio non è plausibile: si rifiuta invece di riempire il disco. */
const MAX_BYTES = 400 * 1024 * 1024;

export function isKind(v: unknown): v is Kind { return v === 'art' || v === 'cli' || v === 'man'; }
function isRows(v: unknown): v is string[] { return Array.isArray(v) && v.every(l => typeof l === 'string'); }

export class ArchiveFiles {
  private readonly dir: string;
  /* Le scritture si mettono in fila: due salvataggi dello stesso file non si accavallano. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'archivi');
  }

  private file(name: string): string { return path.join(this.dir, name + '.json'); }

  private async read(name: string): Promise<{ rows: string[]; at: string } | null> {
    let text: string;
    try { text = await fs.readFile(this.file(name), 'utf8'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
    const o = JSON.parse(text) as { formato?: unknown; versione?: unknown; rows?: unknown; at?: unknown };
    if (!o || o.formato !== FORMAT || !(Number(o.versione) >= 1) || Number(o.versione) > VERSION || !isRows(o.rows)) throw new Error('archivio non valido: ' + name);
    return { rows: o.rows, at: typeof o.at === 'string' ? o.at : '' };
  }

  private write(name: string, rows: string[], at: string): Promise<void> {
    const job = this.queue.then(async () => {
      const text = JSON.stringify({ formato: FORMAT, versione: VERSION, at, rows });
      if (Buffer.byteLength(text) > MAX_BYTES) throw Object.assign(new Error('archivio troppo grande'), { code: 'quota_exceeded' });
      await fs.mkdir(this.dir, { recursive: true });
      const target = this.file(name), tmp = target + '.tmp';
      await fs.writeFile(tmp, text, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(tmp, target);
    });
    this.queue = job.catch(() => {});
    return job;
  }

  async load(): Promise<StoredArchives> {
    const out: StoredArchives = { art: null, cli: null, man: null, alias: null };
    for (const k of KINDS) out[k] = await this.read(k);
    const al = await this.read('abbinamenti');
    out.alias = al ? al.rows : null;
    return out;
  }

  save(kind: Kind, archive: StoredArchive): Promise<void> {
    if (!isKind(kind) || !archive || !isRows(archive.rows) || typeof archive.at !== 'string') return Promise.reject(new Error('richiesta non valida'));
    return this.write(kind, archive.rows, archive.at.slice(0, 32));
  }

  saveAlias(rows: string[]): Promise<void> {
    if (!isRows(rows)) return Promise.reject(new Error('richiesta non valida'));
    return this.write('abbinamenti', rows, '');
  }
}
