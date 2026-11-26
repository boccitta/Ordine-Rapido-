/*
 * Ordine Rapido - logica pura: numeri, calcoli, controlli, abbinamento con l'archivio e costruzione del file.
 * Nessun accesso alla pagina: questo file si può provare da solo con Node (vedi test/core.test.js).
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
var Core = (function(){
  function num(v){
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim().replace(/[\s€%]/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function round(n, d){ var f = Math.pow(10, d); return Math.round((n + Number.EPSILON) * f) / f; }
  function trimNum(n, min, max){
    var s = n.toFixed(max);
    if (s.indexOf('.') >= 0) {
      var parts = s.split('.');
      var d = parts[1].replace(/0+$/, '');
      while (d.length < min) d += '0';
      s = d ? parts[0] + '.' + d : parts[0];
    }
    if (s === '-0') s = '0';
    return s;
  }
  var KIND = { qty:[0,3], price:[2,5], pct:[0,2], money:[2,2] };
  function show(n, kind, dec){
    if (n === null || n === undefined) return '';
    var k = KIND[kind] || KIND.qty;
    return trimNum(n, k[0], k[1]).replace('.', dec || ',');
  }
  function fmtDate(iso, style){
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    if (style === 'iso') return iso;
    if (style === 'compact') return m[3] + m[2] + m[1];
    return m[3] + '/' + m[2] + '/' + m[1];
  }
  function rowCalc(r){
    var p = num(r.prezzo), q = num(r.quantita), f = 1;
    ['sc1','sc2','sc3'].forEach(function(k){ var s = num(r[k]); if (s) f *= (1 - s / 100); });
    var netto = p === null ? null : round(p * f, 5);
    var totale = r.omaggio ? 0 : (netto === null || q === null ? null : round(q * netto, 5));
    return { netto: netto, totale: totale };
  }
  function totals(order){
    var t = { righe: order.righe.length, colli: 0, pezzi: 0, merce: 0, omaggi: 0, incompleti: 0 };
    order.righe.forEach(function(r){
      var c = rowCalc(r);
      t.colli += num(r.colli) || 0;
      t.pezzi += num(r.quantita) || 0;
      if (r.omaggio) t.omaggi++;
      if (c.totale === null) t.incompleti++; else t.merce += c.totale;
    });
    t.merce = round(t.merce, 5);
    return t;
  }
  /* ----- Anagrafiche: normalizzazione, indice, abbinamento ----- */
  function str(s){ return s === null || s === undefined ? '' : String(s); }
  function normCode(s){ return str(s).trim().toUpperCase().replace(/\s+/g, ''); }
  function noZeros(s){ return s.replace(/^0+(?=.)/, ''); }
  function digits(s){ return str(s).replace(/\D/g, ''); }
  function normText(s){ return str(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(); }
  var LEGAL = { SPA:1, SRL:1, SRLS:1, SNC:1, SAS:1, SAPA:1, SCARL:1, COOP:1, SOC:1, ARL:1, UNIPERSONALE:1 };
  function companyKey(s){ return normText(s).split(' ').filter(function(t){ return t.length > 1 && !LEGAL[t]; }).join(' '); }
  function keyMatch(a, b){ if (!a || !b) return false; return a === b || (' ' + a + ' ').indexOf(' ' + b + ' ') >= 0 || (' ' + b + ' ').indexOf(' ' + a + ' ') >= 0; }
  function sameCompany(a, b){ return keyMatch(companyKey(a), companyKey(b)); }
  function tokens(s){ return normText(s).split(' ').filter(function(t){ return t.length > 1 || /\d/.test(t); }); }
  var PACK = { art:['cod','desc','ean','um','mand','prezzo'], cli:['cod','nome','piva'], man:['cod','nome','piva'] };
  function pack(kind, it){ return PACK[kind].map(function(f){ return str(it[f]).replace(/[\t\r\n]+/g, ' '); }).join('\t'); }
  function unpack(kind, line){ var p = str(line).split('\t'), o = {}; PACK[kind].forEach(function(f, i){ o[f] = p[i] || ''; }); return o; }
  function itemKey(kind, it){ return kind === 'art' ? companyKey(it.mand) + '|' + normCode(it.cod) : normCode(it.cod); }
  function mergeItems(kind, old, items){
    var pos = Object.create(null), out = [];
    old.concat(items).forEach(function(it){ var k = itemKey(kind, it); if (k in pos) out[pos[k]] = it; else { pos[k] = out.length; out.push(it); } });
    return out;
  }
  function rowsToItems(kind, rows, map, hasHeader, fixedMand){
    var out = [];
    function get(r, f){ var i = map[f]; return (i === undefined || i === null || i < 0) ? '' : str(r[i]).replace(/[\t\r\n]+/g, ' ').trim(); }
    for (var k = hasHeader ? 1 : 0; k < rows.length; k++) {
      var r = rows[k] || [], cod = get(r, 'cod');
      if (!cod) continue;
      out.push(kind === 'art'
        ? { cod:cod, desc:get(r, 'desc'), ean:get(r, 'ean'), um:get(r, 'um').toUpperCase(), mand:get(r, 'mand') || str(fixedMand).trim(), prezzo:get(r, 'prezzo') }
        : { cod:cod, nome:get(r, 'nome'), piva:get(r, 'piva') });
    }
    return mergeItems(kind, [], out);
  }
  function detectSep(text){
    var lines = text.split(/\r?\n/).filter(function(l){ return l.trim(); }).slice(0, 15), best = ';', bestN = 0;
    [';', '\t', ',', '|'].forEach(function(s){
      var min = Math.min.apply(null, lines.map(function(l){ return l.split(s).length - 1; }));
      if (min > bestN) { bestN = min; best = s; }
    });
    return best;
  }
  function parseDelimited(text, sep){
    var rows = [], row = [], cur = '', q = false, i = 0, c;
    text = text.replace(/^\uFEFF/, '');
    for (; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"' && cur === '') q = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(function(v){ return v.trim(); })) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some(function(v){ return v.trim(); })) rows.push(row);
    return rows;
  }
  var HINT = {
    art: [['ean', /ean|barcode|barre/, null], ['desc', /descr/, null], ['um', /^u\.?\s*m\.?$|unimis|unit.{1,2}\s*(di\s*)?mis/, null], ['prezzo', /prezzo|listino/, null],
          ['mand', /mandante|fornitore|ditta|marca|casa/, /cod/], ['cod', /cod|art|sku/, /forn|mand|client|ean|barre|iva|cat|fam|grup|descr|fisc/]],
    cli: [['piva', /p\.?\s*iva|partita/, null], ['cod', /cod/, /fisc|iva|cap|agent|zona|pag|dest|banc/], ['nome', /ragione|denominaz|nominativo|nome|cliente/, /cod/]],
    man: [['piva', /p\.?\s*iva|partita/, null], ['cod', /cod/, /fisc|iva|cap|agent|zona|pag|dest|banc/], ['nome', /ragione|denominaz|nominativo|nome|mandante|fornitore|ditta|casa/, /cod/]]
  };
  function guessMap(kind, header){
    var map = {}, used = {}, n = 0;
    HINT[kind].forEach(function(h){
      for (var i = 0; i < header.length; i++) {
        var t = str(header[i]).trim().toLowerCase();
        if (!used[i] && t && h[1].test(t) && !(h[2] && h[2].test(t))) { map[h[0]] = i; used[i] = 1; n++; break; }
      }
    });
    return { map:map, found:n };
  }
  function buildIndex(arts){
    var ix = { arts:arts, code:Object.create(null), codeNz:Object.create(null), ean:Object.create(null), mk:[], tok:null };
    arts.forEach(function(a, i){
      var c = normCode(a.cod), e = digits(a.ean);
      ix.mk.push(companyKey(a.mand));
      if (c) { (ix.code[c] = ix.code[c] || []).push(i); var z = noZeros(c); (ix.codeNz[z] = ix.codeNz[z] || []).push(i); }
      if (e.length >= 8) (ix.ean[e] = ix.ean[e] || []).push(i);
    });
    return ix;
  }
  function lookup(ix, map, key, mk){
    var list = map[key];
    if (!list) return null;
    if (mk) { var f = list.filter(function(i){ return keyMatch(ix.mk[i], mk); }); if (f.length) list = f; }
    return list;
  }
  function linkOf(a, ok, via){ return { cod:a.cod, desc:a.desc, um:a.um, mand:a.mand, ok:ok, via:via }; }
  function aliasKeys(order, row){
    var ck = digits(order.piva) || companyKey(order.cliente), keys = [], a = normCode(row.cod_articolo), c = normCode(row.cod_cliente), d = normText(row.descrizione);
    if (a) keys.push('x|' + companyKey(order.mandante) + '|' + a);
    if (c) keys.push('c|' + ck + '|' + c);
    if (d) keys.push('d|' + ck + '|' + d);
    return keys;
  }
  function matchRow(ix, row, order, alias){
    if (!ix || !ix.arts.length) return null;
    var mk = companyKey(order.mandante), c = normCode(row.cod_articolo), list = null, via = '';
    if (c) { list = lookup(ix, ix.code, c, mk) || lookup(ix, ix.codeNz, noZeros(c), mk); via = 'codice'; }
    if (!list) {
      var e = digits(row.ean);
      if (e.length < 8 && /^\d{8,14}$/.test(c)) e = c;
      if (e.length >= 8) { list = lookup(ix, ix.ean, e, mk); via = 'ean'; }
    }
    if (!list && alias) {
      var keys = aliasKeys(order, row);
      for (var k = 0; k < keys.length && !list; k++) { var cod = alias[keys[k]]; if (cod) { list = lookup(ix, ix.code, normCode(cod), mk); via = 'storico'; } }
    }
    if (!list) return { cod:'', desc:'', um:'', mand:'', ok:false, via:'' };
    if (list.length === 1) return linkOf(ix.arts[list[0]], true, via);
    var l = linkOf(ix.arts[list[0]], false, 'multi');
    l.multi = list.slice(0, 25).map(function(i){ return ix.arts[i]; });
    return l;
  }
  function search(ix, query, mandante, n){
    if (!ix) return [];
    if (!ix.tok) ix.tok = ix.arts.map(function(a){ return tokens(a.desc); });
    var q = tokens(query), qc = normCode(query), mk = companyKey(mandante), qs = Object.create(null), qn = 0, out = [];
    q.forEach(function(t){ if (!qs[t]) { qs[t] = 1; qn++; } });
    if (!qn && qc.length < 2) return out;
    for (var i = 0; i < ix.arts.length; i++) {
      var t = ix.tok[i], inter = 0, seen = Object.create(null);
      for (var j = 0; j < t.length; j++) if (qs[t[j]] && !seen[t[j]]) { seen[t[j]] = 1; inter++; }
      var s = inter ? inter / Math.sqrt(qn * Math.max(1, t.length)) : 0;
      if (qc.length >= 3 && normCode(ix.arts[i].cod).indexOf(qc) >= 0) s += 1;
      if (s > 0 && mk && ix.mk[i] && !keyMatch(ix.mk[i], mk)) s *= 0.3;
      if (s > 0) out.push({ i:i, s:s });
    }
    out.sort(function(x, y){ return y.s - x.s || x.i - y.i; });
    return out.slice(0, n || 10).map(function(o){ return { art:ix.arts[o.i], score:o.s }; });
  }
  /* Cliente o casa mandante: prima per partita IVA, poi per ragione sociale. Se i candidati sono più d'uno non sceglie. */
  function matchParty(list, name, piva){
    if (!list || !list.length) return null;
    var p = digits(piva), hits;
    if (p.length >= 8) { hits = list.filter(function(c){ return digits(c.piva) === p; }); if (hits.length) return hits[0]; }
    var k = companyKey(name);
    if (!k) return null;
    hits = list.filter(function(c){ return companyKey(c.nome) === k; });
    if (hits.length === 1) return hits[0];
    hits = list.filter(function(c){ return keyMatch(companyKey(c.nome), k); });
    return hits.length === 1 ? hits[0] : null;
  }
  function matchClient(clis, order){ return matchParty(clis, order.cliente, order.piva); }
  function matchMandante(mans, order){ return matchParty(mans, order.mandante, order.mandante_piva); }
  function unlinked(order){ return order.righe.filter(function(r){ return !(r.link && r.link.ok); }).length; }

  function checks(order, ctx){
    var out = [], t = totals(order);
    if (!t.righe) return [{ level:'warn', text:'Nessuna riga' }];
    if (ctx && ctx.hasArt) {
      var sug = 0, none = 0;
      order.righe.forEach(function(r){ var l = r.link; if (l && l.ok) return; if (l && l.cod) sug++; else none++; });
      if (none) out.push({ level:'bad', text: none + (none === 1 ? ' riga non in anagrafica' : ' righe non in anagrafica') });
      if (sug) out.push({ level:'warn', text: sug + (sug === 1 ? ' abbinamento da confermare' : ' abbinamenti da confermare') });
      if (!none && !sug) out.push({ level:'ok', text:'Tutti i codici esistono nel gestionale' });
    } else if (ctx) out.push({ k:'noarch', level:'warn', text:'Archivio articoli non caricato: i codici non sono verificati.' });
    if (ctx && ctx.hasMan) out.push(ctx.manOk ? { level:'ok', text:'Mandante in anagrafica: ' + String(order.mandante_cod).trim() } : { level:'warn', text:'Casa mandante non trovata in anagrafica' });
    if (ctx && ctx.hasCli) out.push(ctx.cliOk ? { level:'ok', text:'Cliente in anagrafica: ' + String(order.cliente_cod).trim() } : { level:'warn', text:'Cliente non trovato in anagrafica' });
    var noCode = 0, noQty = 0, diff = [];
    order.righe.forEach(function(r, i){
      if (!String(r.cod_articolo || '').trim() && !(r.link && r.link.ok)) noCode++;
      if (num(r.quantita) === null) noQty++;
      var c = rowCalc(r), nd = num(r.netto_doc), td = num(r.totale_doc);
      if (!r.omaggio && ((nd !== null && c.netto !== null && Math.abs(nd - c.netto) > 0.0051) ||
          (td !== null && c.totale !== null && Math.abs(td - c.totale) > 0.011))) diff.push(i + 1);
    });
    if (noQty) out.push({ level:'bad', text: noQty + (noQty === 1 ? ' riga senza quantità' : ' righe senza quantità') });
    if (noCode) out.push({ level:'warn', text: noCode + (noCode === 1 ? ' riga senza codice articolo' : ' righe senza codice articolo') });
    if (diff.length) out.push({ level:'warn', text:'Netto o totale diverso dal documento: riga ' + diff.join(', ') });
    var ti = num(order.tot_imponibile), tc = num(order.tot_colli), tp = num(order.tot_pezzi);
    if (ti !== null) {
      var okI = Math.abs(ti - t.merce) <= 0.02 && !t.incompleti;
      out.push(okI ? { k:'imp', level:'ok', text:'Importo merce ' + show(ti, 'money') + ' come sul documento' }
                   : { k:'imp', level:'bad', text:'Importo merce ' + show(round(t.merce, 2), 'money') + ', sul documento ' + show(ti, 'money') });
    }
    if (tc !== null) out.push(Math.abs(tc - t.colli) < 0.001 ? { k:'colli', level:'ok', text: show(tc, 'qty') + ' colli come sul documento' }
                   : { k:'colli', level:'bad', text: show(t.colli, 'qty') + ' colli, sul documento ' + show(tc, 'qty') });
    if (tp !== null) out.push(Math.abs(tp - t.pezzi) < 0.001 ? { k:'pezzi', level:'ok', text: show(tp, 'qty') + ' pezzi come sul documento' }
                   : { k:'pezzi', level:'bad', text: show(t.pezzi, 'qty') + ' pezzi, sul documento ' + show(tp, 'qty') });
    if (t.omaggi) out.push({ level:'info', text: t.omaggi + (t.omaggi === 1 ? ' riga omaggio' : ' righe omaggio') });
    if (ti === null && tc === null && tp === null) out.push({ level:'info', text:'Nessun totale sul documento da confrontare' });
    return out;
  }

  /* Catalogo delle colonne esportabili. g: 'r' riga, 't' testata (ripetuta su ogni riga). */
  var COLS = [
    { id:'cod_articolo', g:'r', label:'Codice articolo mandante', header:'CodArticolo', on:true },
    { id:'descrizione', g:'r', label:'Descrizione', header:'Descrizione', on:true },
    { id:'um', g:'r', label:'Unità di misura', header:'Unimis', on:true },
    { id:'quantita', g:'r', label:'Quantità', header:'Quantita', on:true },
    { id:'colli', g:'r', label:'Colli', header:'Colli', on:true },
    { id:'prezzo', g:'r', label:'Prezzo unitario', header:'Prezzo', on:true },
    { id:'sc1', g:'r', label:'Sconto 1 %', header:'Sconto1', on:true },
    { id:'sc2', g:'r', label:'Sconto 2 %', header:'Sconto2', on:true },
    { id:'sc3', g:'r', label:'Sconto 3 %', header:'Sconto3', on:false },
    { id:'omaggio', g:'r', label:'Omaggio S/N', header:'Omaggio', on:true },
    { id:'netto', g:'r', label:'Prezzo netto', header:'PrezzoNetto', on:false },
    { id:'totale', g:'r', label:'Totale riga', header:'Totale', on:false },
    { id:'cod_cliente', g:'r', label:'Codice articolo del cliente', header:'CodArtCliente', on:false },
    { id:'ean', g:'r', label:'EAN', header:'EAN', on:false },
    { id:'nota', g:'r', label:'Nota riga', header:'NotaRiga', on:false },
    { id:'numero', g:'t', label:'N. ordine cliente', header:'NumOrdine', on:true },
    { id:'data', g:'t', label:'Data ordine', header:'DataOrdine', on:true },
    { id:'consegna', g:'t', label:'Data consegna', header:'DataConsegna', on:true },
    { id:'cliente_cod', g:'t', label:'Codice cliente', header:'CodCliente', on:true },
    { id:'cliente', g:'t', label:'Cliente', header:'Cliente', on:true },
    { id:'piva', g:'t', label:'P.IVA cliente', header:'PIvaCliente', on:true },
    { id:'mandante_cod', g:'t', label:'Codice mandante', header:'CodMandante', on:true },
    { id:'mandante', g:'t', label:'Casa mandante', header:'Mandante', on:true },
    { id:'pagamento', g:'t', label:'Pagamento', header:'Pagamento', on:true },
    { id:'destinazione', g:'t', label:'Destinazione merce', header:'Destinazione', on:true },
    { id:'note', g:'t', label:'Note', header:'Note', on:true }
  ];
  function colDef(id){ for (var i = 0; i < COLS.length; i++) if (COLS[i].id === id) return COLS[i]; return null; }
  function defaultProfile(){
    return { sep:';', dec:',', date:'dmy', enc:'cp1252', um:'PZ', omaggi:'sconto100', header:true, descSrc:'gesacom', allowUnlinked:false,
      cols: COLS.map(function(c){ return { id:c.id, on:c.on, header:c.header }; }) };
  }
  function mergeProfile(saved){
    var p = defaultProfile();
    if (!saved || typeof saved !== 'object') return p;
    ['sep','dec','date','enc','um','omaggi','descSrc'].forEach(function(k){ if (typeof saved[k] === 'string') p[k] = saved[k]; });
    if (typeof saved.header === 'boolean') p.header = saved.header;
    if (typeof saved.allowUnlinked === 'boolean') p.allowUnlinked = saved.allowUnlinked;
    if (Array.isArray(saved.cols)) {
      var seen = {}, cols = [];
      saved.cols.forEach(function(c){
        if (c && colDef(c.id) && !seen[c.id]) { seen[c.id] = 1; cols.push({ id:c.id, on:!!c.on, header:String(c.header || colDef(c.id).header) }); }
      });
      p.cols.forEach(function(c){ if (!seen[c.id]) cols.push(c); });
      p.cols = cols;
    }
    return p;
  }
  function value(id, order, r, p){
    var c = rowCalc(r), gift = !!r.omaggio, d = p.dec, lk = r.link && r.link.ok ? r.link : null;
    switch (id) {
      case 'cod_articolo': return lk ? lk.cod : String(r.cod_articolo || '').trim();
      case 'descrizione': return lk && lk.desc && p.descSrc !== 'doc' ? lk.desc : String(r.descrizione || '').trim();
      case 'um': return (lk && lk.um) || String(r.um || '').trim() || p.um || '';
      case 'quantita': return show(num(r.quantita), 'qty', d);
      case 'colli': return show(num(r.colli), 'qty', d);
      case 'prezzo': return gift && p.omaggi === 'prezzo0' ? show(0, 'price', d) : show(num(r.prezzo), 'price', d);
      case 'sc1': return gift && p.omaggi === 'sconto100' ? '100' : show(num(r.sc1), 'pct', d);
      case 'sc2': return gift && p.omaggi === 'sconto100' ? '' : show(num(r.sc2), 'pct', d);
      case 'sc3': return gift && p.omaggi === 'sconto100' ? '' : show(num(r.sc3), 'pct', d);
      case 'omaggio': return gift ? 'S' : 'N';
      case 'netto': return gift ? show(0, 'price', d) : show(c.netto, 'price', d);
      case 'totale': return c.totale === null ? '' : show(round(c.totale, 2), 'money', d);
      case 'cod_cliente': return String(r.cod_cliente || '').trim();
      case 'ean': return String(r.ean || '').trim();
      case 'nota': return String(r.nota || '').trim();
      case 'data': return fmtDate(order.data, p.date);
      case 'consegna': return fmtDate(order.consegna, p.date);
      default: return String(order[id] || '').trim();
    }
  }
  function buildTable(order, p){
    var cols = p.cols.filter(function(c){ return c.on; });
    return {
      headers: cols.map(function(c){ return c.header; }),
      rows: order.righe.map(function(r){ return cols.map(function(c){ return value(c.id, order, r, p); }); })
    };
  }
  function cell(v, sep){
    v = v === null || v === undefined ? '' : String(v);
    if (sep === '\t') return v.replace(/[\t\r\n]+/g, ' ');
    return (v.indexOf(sep) >= 0 || /["\r\n]/.test(v) || /^\s|\s$/.test(v)) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function toDelimited(table, sep, withHeader){
    var lines = [];
    if (withHeader) lines.push(table.headers.map(function(h){ return cell(h, sep); }).join(sep));
    table.rows.forEach(function(r){ lines.push(r.map(function(v){ return cell(v, sep); }).join(sep)); });
    return lines.join('\r\n') + '\r\n';
  }
  var CP = {0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F};
  function toCp1252(str){
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      out[i] = (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) ? c : (CP[c] || 0x3F);
    }
    return out;
  }
  function slug(s, n){
    var full = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    n = n || 24;
    if (full.length <= n) return full;
    var cut = full.slice(0, n), i = cut.lastIndexOf('-');
    return (full.charAt(n) !== '-' && i > 3 ? cut.slice(0, i) : cut).replace(/-+$/, '');
  }
  function fileName(order){
    var parts = ['ordine', slug(order.mandante), slug(order.cliente), slug(order.numero, 16), order.data || ''].filter(Boolean);
    return parts.join('_') + '.csv';
  }
  /* ----- Risposta del modello: estrae l'oggetto o l'array JSON anche se è incorniciato da altro testo ----- */
  function extractJson(text){
    var s = str(text).trim();
    try { return JSON.parse(s); } catch (e) {}
    var fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
    if (fence) { try { return JSON.parse(fence[1].trim()); } catch (e) {} }
    var a = s.search(/[\[{]/);
    if (a < 0) throw { code:'invalid_json' };
    var b = s.lastIndexOf(s.charAt(a) === '{' ? '}' : ']');
    if (b <= a) throw { code:'invalid_json' };
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { throw { code:'invalid_json' }; }
  }

  /* ----- Copia di sicurezza degli archivi: un file JSON con un formato dichiarato e numerato ----- */
  var BACKUP_ID = 'ordine-rapido-archivio', BACKUP_VER = 1, KINDS = ['art', 'cli', 'man'];
  function emptyArchive(){ return { art:[], cli:[], man:[], alias:Object.create(null), artAt:'', cliAt:'', manAt:'' }; }
  function backupBuild(arch, profile, appVersion, date){
    var o = { formato:BACKUP_ID, versione_formato:BACKUP_VER, app:str(appVersion), creato_il:str(date), tracciato:profile || null, abbinamenti:{} }, key;
    KINDS.forEach(function(k){
      o[k] = { aggiornato_il:str(arch[k + 'At']), campi:PACK[k].slice(), righe:(arch[k] || []).map(function(it){ return PACK[k].map(function(f){ return str(it[f]); }); }) };
    });
    for (key in arch.alias) o.abbinamenti[key] = arch.alias[key];
    return o;
  }
  function backupParse(o){
    if (!o || typeof o !== 'object' || o.formato !== BACKUP_ID) throw { code:'local', message:'Questo file non è una copia di sicurezza di Ordine Rapido.' };
    var v = Number(o.versione_formato);
    if (!(v >= 1)) throw { code:'local', message:'Questo file non è una copia di sicurezza di Ordine Rapido.' };
    if (v > BACKUP_VER) throw { code:'local', message:'Questa copia è stata creata da una versione più recente di Ordine Rapido. Aggiorna l\'app e riprova.' };
    var out = emptyArchive(), key;
    out.profile = null;
    KINDS.forEach(function(k){
      var b = o[k];
      if (!b || !Array.isArray(b.righe)) return;
      var campi = Array.isArray(b.campi) ? b.campi : PACK[k];
      var items = b.righe.filter(Array.isArray).map(function(r){
        var it = {};
        PACK[k].forEach(function(f){ var i = campi.indexOf(f); it[f] = i >= 0 ? str(r[i]).replace(/[\t\r\n]+/g, ' ') : ''; });
        return it;
      }).filter(function(it){ return it.cod.trim(); });
      out[k] = mergeItems(k, [], items);
      out[k + 'At'] = str(b.aggiornato_il);
    });
    if (o.abbinamenti && typeof o.abbinamenti === 'object') for (key in o.abbinamenti) if (typeof o.abbinamenti[key] === 'string') out.alias[key] = o.abbinamenti[key];
    if (o.tracciato && typeof o.tracciato === 'object') out.profile = mergeProfile(o.tracciato);
    return out;
  }

  return { num:num, round:round, show:show, fmtDate:fmtDate, rowCalc:rowCalc, totals:totals, checks:checks, COLS:COLS, colDef:colDef,
    defaultProfile:defaultProfile, mergeProfile:mergeProfile, buildTable:buildTable, toDelimited:toDelimited, toCp1252:toCp1252, fileName:fileName,
    normCode:normCode, normText:normText, companyKey:companyKey, pack:pack, unpack:unpack, mergeItems:mergeItems, rowsToItems:rowsToItems,
    detectSep:detectSep, parseDelimited:parseDelimited, guessMap:guessMap, buildIndex:buildIndex, linkOf:linkOf, aliasKeys:aliasKeys,
    matchRow:matchRow, search:search, matchClient:matchClient, matchMandante:matchMandante, unlinked:unlinked,
    extractJson:extractJson, emptyArchive:emptyArchive, backupBuild:backupBuild, backupParse:backupParse, KINDS:KINDS };
})();
if (typeof module !== 'undefined') module.exports = Core;
