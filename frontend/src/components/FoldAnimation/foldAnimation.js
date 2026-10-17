/**
 * Animação "papel bruto → origami" do Furl (JS puro, sem dependências).
 *   const f = createFold(div, { url, speed: 1, onDone });
 *   f.start();          // papel kraft → vincos → 3 dobras (repete em loop enquanto a API não responde)
 *   f.resolve(shortUrl) // API respondeu: termina rápido → origami coral → link curto
 *   f.fail()            // API falhou: o vinco não encaixa, o papel treme
 *   f.destroy();
 * onDone({ status: 'ok' | 'error', shortUrl? }) é chamado ao final.
 */
const D = { paper: 350, crease: 600, fold: 650, morph: 550, land: 450 }; // ms (≈3,7 s no total)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CANCEL = Symbol('cancel');
const FAIL = Symbol('fail');

const MARKUP = `
<div class="fold__sheet">
  <div class="fold__face">
    <span class="fold__text"></span>
    <i class="fold__crease fold__crease--v"></i><i class="fold__crease fold__crease--h"></i>
  </div>
  <div class="fold__flap fold__flap--x"><i><span class="fold__text fold__text--clone"></span></i><i></i></div>
  <div class="fold__flap fold__flap--y"><i></i><i></i></div>
</div>
<div class="fold__origami">
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <polygon points="58,8 6,30 26,38" fill="var(--color-accent)" />
    <polygon points="58,8 6,30 26,38" fill="var(--color-paper-white)" fill-opacity=".3" />
    <polygon points="58,8 26,38 30,58" fill="var(--color-accent)" />
    <polygon points="58,8 30,58 40,40" fill="var(--color-indigo-night)" fill-opacity=".28" />
    <polygon points="26,38 30,58 20,44" fill="var(--color-indigo-night)" fill-opacity=".4" />
  </svg>
  <span class="fold__code"></span>
</div>`;

export function createFold(root, { url = '', speed = 1, onDone } = {}) {
  let alive = true;
  let result = null;
  let failed = false;
  const reduce = !!(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const ms = (k) => Math.round(D[k] * speed); // a animação toca inteira, mesmo com a resposta já em mãos
  const css = (o) => { for (const k in o) root.style.setProperty(k, o[k]); };
  const $ = (s) => root.querySelector(s);
  const phase = (p) => { root.dataset.phase = p; };

  root.innerHTML = MARKUP;
  root.querySelectorAll('.fold__text').forEach((el) => { el.textContent = url; });
  const face = $('.fold__face');
  const w0 = Math.max(160, Math.min(360, root.clientWidth - 32));
  const h0 = Math.round(w0 * 0.31);
  let w = w0;
  let h = h0;
  css({ '--w0': `${w0}px` });
  phase('idle');

  const timing = () => css({
    '--paper-ms': `${ms('paper')}ms`, '--crease-ms': `${ms('crease')}ms`,
    '--flap-ms': `${Math.round(ms('fold') * 0.7)}ms`, '--morph-ms': `${ms('morph')}ms`, '--land-ms': `${ms('land')}ms`,
  });
  const step = async (k, frac = 1) => {
    await wait(ms(k) * frac);
    if (!alive) throw CANCEL;
    if (failed) throw FAIL;
  };
  const crease = (axes) => { root.dataset.crease = ''; void root.offsetWidth; root.dataset.crease = axes; };

  function resetSheet() {
    w = w0; h = h0;
    css({ '--w': `${w}px`, '--h': `${h}px`, '--sx': '0px', '--sy': '0px', '--rot': '0deg', '--sc': 1 });
    face.classList.remove('is-back');
    delete root.dataset.flap; delete root.dataset.folded; delete root.dataset.crease;
  }

  // Ao fim de cada dobra: a aba já cobre a metade; a folha passa a ter o tamanho dobrado.
  function snap(axis) {
    const nw = axis === 'x' ? w / 2 : w;
    const nh = axis === 'y' ? h / 2 : h;
    root.classList.add('is-snapping');
    delete root.dataset.flap;
    root.dataset.folded = '';
    face.classList.add('is-back');
    css({ '--w': `${nw}px`, '--h': `${nh}px`, '--sx': axis === 'x' ? `${-nw / 2}px` : '0px', '--sy': axis === 'y' ? `${-nh / 2}px` : '0px' });
    w = nw; h = nh;
    void root.offsetWidth;
    root.classList.remove('is-snapping');
    css({ '--sx': '0px', '--sy': '0px' });
  }

  async function fold(axis, draw) {
    timing();
    if (draw) { crease(axis === 'x' ? 'v' : 'h'); await step('fold', 0.3); }
    timing();
    root.dataset.flap = axis;
    await step('fold', 0.7);
    snap(axis);
  }

  async function cycle() {
    resetSheet(); timing(); phase('paper'); await step('paper');
    phase('creases'); crease('v h'); await step('crease'); root.dataset.crease = '';
    phase('fold');
    await fold('x', false); await fold('x', true); await fold('y', true);
  }

  async function run() {
    try {
      do {
        await cycle();
        if (!result) { phase('retry'); await step('paper'); } // API ainda não respondeu: recomeça
      } while (!result);
      timing(); phase('morph'); await step('morph');
      phase('landed'); await step('land');
      onDone?.({ status: 'ok', shortUrl: result });
    } catch (e) {
      if (e === CANCEL) return;
      if (e !== FAIL) throw e;
      phase('fail');
      await wait(500 * speed);
      if (alive) onDone?.({ status: 'error' });
    }
  }

  return {
    start() { if (reduce) { resetSheet(); phase('paper'); } else run(); },
    resolve(shortUrl) {
      result = shortUrl;
      $('.fold__code').textContent = String(shortUrl).replace(/\/+$/, '').split('/').pop();
      if (reduce) { phase('landed'); onDone?.({ status: 'ok', shortUrl }); }
    },
    fail() {
      failed = true;
      if (reduce) { phase('fail'); onDone?.({ status: 'error' }); }
    },
    destroy() { alive = false; },
  };
}
