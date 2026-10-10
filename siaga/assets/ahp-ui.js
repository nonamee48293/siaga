/*
 * SIAGA - formulir perbandingan berpasangan AHP (dipakai di index.html dan ahp.html)
 * dan kode jawaban yang bisa dikirim responden lewat chat.
 */
(function () {
  'use strict';
  const S = window.SIAGA;
  const ORDER = S.CRITERIA;                       // time, imp, diff, dur
  const NAME = S.CRITERIA_LABEL;
  const DEFS = {
    time: 'seberapa dekat batas waktu pengumpulan',
    imp: 'seberapa besar pengaruh tugas terhadap nilai akhir',
    diff: 'seberapa sulit tugas dikerjakan',
    dur: 'berapa lama tugas dikerjakan'
  };
  const WORDS = { 2: 'antara sama dan sedikit lebih penting', 3: 'sedikit lebih penting', 4: 'antara sedikit dan jelas lebih penting', 5: 'jelas lebih penting', 6: 'antara jelas dan sangat jelas lebih penting', 7: 'sangat jelas lebih penting', 8: 'antara sangat jelas dan mutlak lebih penting', 9: 'mutlak lebih penting' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = x => (x * 100).toFixed(1).replace('.', ',') + '%';

  /* p > 0: kriteria kiri lebih penting. p < 0: kriteria kanan lebih penting. */
  function say(p, a, b) {
    if (p === 0) return 'Sama penting (nilai 1)';
    const v = Math.abs(p) + 1;
    return `${p > 0 ? a : b} ${WORDS[v]} (nilai ${v})`;
  }

  function definitions() {
    return '<div class="def">' + ORDER.map(k => `<span><b>${NAME[k]}</b>: ${DEFS[k]}</span>`).join('') + '</div>';
  }

  function resultHtml(res) {
    const bars = ORDER.map((k, i) => {
      const colors = { time: 'var(--c-time)', imp: 'var(--c-imp)', diff: 'var(--c-diff)', dur: 'var(--c-dur)' };
      return `<div class="wbar"><span>${NAME[k]}</span><div class="track"><i style="width:${(res.w[i] * 100).toFixed(1)}%;background:${colors[k]}"></i></div><output>${pct(res.w[i])}</output></div>`;
    }).join('');
    const crTxt = res.cr.toFixed(3).replace('.', ',');
    const cls = res.consistent ? 'crbox' : 'crbox bad';
    const msg = res.consistent ? `CR ${crTxt}: jawaban konsisten.` : `CR ${crTxt}: jawaban kurang konsisten (batas 0,1). Tinjau lagi perbandingan yang saling bertentangan.`;
    return `<div class="wbars">${bars}</div><div class="${cls}">${msg}</div>`;
  }

  /*
   * Membangun formulir di dalam container. opts.onChange(pairs, hasil) dipanggil tiap perubahan.
   * Slider: kiri = kriteria kiri lebih penting. Nilai disimpan sebagai p (positif = kiri lebih penting).
   */
  function build(container, opts) {
    opts = opts || {};
    const pairs = [0, 0, 0, 0, 0, 0];
    const rows = S.PAIRS.map(([i, j], k) => {
      const a = NAME[ORDER[i]], b = NAME[ORDER[j]];
      return `<div class="pair">
        <div class="ends"><span>${a}</span><span>${b}</span></div>
        <input type="range" min="-8" max="8" step="1" value="0" data-k="${k}" aria-label="Mana yang lebih penting, ${a} atau ${b}">
        <div class="say" id="say-${container.id}-${k}">Sama penting (nilai 1)</div></div>`;
    }).join('');
    container.innerHTML = `${definitions()}${rows}<div id="res-${container.id}"></div>`;
    const resBox = container.querySelector('#res-' + container.id);

    function refresh() {
      const res = S.ahp(S.matrixFromPairs(pairs));
      S.PAIRS.forEach(([i, j], k) => { container.querySelector('#say-' + container.id + '-' + k).textContent = say(pairs[k], NAME[ORDER[i]], NAME[ORDER[j]]); });
      resBox.innerHTML = resultHtml(res);
      if (opts.onChange) opts.onChange(pairs.slice(), res);
    }
    container.querySelectorAll('input[type=range]').forEach(el => el.addEventListener('input', () => {
      pairs[Number(el.dataset.k)] = -Number(el.value);      // geser ke kiri = kiri lebih penting
      refresh();
    }));
    refresh();
    return {
      get: () => pairs.slice(),
      set(p) { p.forEach((v, k) => { pairs[k] = v; container.querySelector(`input[data-k="${k}"]`).value = -v; }); refresh(); },
      reset() { this.set([0, 0, 0, 0, 0, 0]); }
    };
  }

  /* Kode jawaban: SIAGA1.<base64 dari JSON>. Aman disalin lewat WhatsApp. */
  function encode(label, pairs) {
    const json = JSON.stringify({ l: String(label).slice(0, 80), p: pairs });
    return 'SIAGA1.' + btoa(unescape(encodeURIComponent(json)));
  }
  function decode(code) {
    const m = String(code).trim().match(/^SIAGA1\.([A-Za-z0-9+/=]+)$/);
    if (!m) return null;
    try {
      const o = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      if (!o || !Array.isArray(o.p) || o.p.length !== 6 || o.p.some(v => !Number.isInteger(v) || v < -8 || v > 8)) return null;
      return { label: String(o.l || 'Responden').slice(0, 80), pairs: o.p };
    } catch (e) { return null; }
  }

  async function copyText(text, fallbackEl) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      if (fallbackEl) { const r = document.createRange(); r.selectNodeContents(fallbackEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      return false;
    }
  }

  window.AhpUI = { build, resultHtml, encode, decode, copyText, say, esc };
})();
