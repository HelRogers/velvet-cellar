// The redacted Private Backstory inside each dossier.
//
// Until the guest confirms the file is theirs, the page holds no readable text
// for this section: only black bars drawn to the size of the words they stand
// for. So the text cannot be found by searching the page, selecting the bars,
// tabbing through or using a screen reader. On reveal the words are put in
// place under the bars and the bars are drawn back in reading order.
//
// This is a courtesy barrier agreed with the host, not security.
import { unseal } from '../lib/seal';

type Block = { label?: string; words: string[] };
type State = 'redacted' | 'revealing' | 'revealed' | 'resealing';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const SENTENCE_END = /[.!?…]["”’)\]]*$/;

function createController(section: HTMLElement) {
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => section.querySelector<T>(selector)!;
  const body = find('[data-private-body]');
  const gate = find<HTMLFormElement>('[data-private-gate]');
  const confirm = find<HTMLInputElement>('[data-private-confirm]');
  const error = find('[data-private-error]');
  const after = find('[data-private-after]');
  const note = find('[data-private-note]');
  const status = find('[data-private-status]');
  const head = find('[data-private-focus]');
  const resealButton = find<HTMLButtonElement>('[data-private-reseal]');

  let blocks: Block[] | null = null;
  let state: State = 'redacted';
  let timers: number[] = [];
  let run = 0; // bumps whenever the file is reset, so stale callbacks do nothing

  const setState = (next: State) => {
    state = next;
    section.dataset.state = next;
  };
  const later = (fn: () => void, ms: number) => {
    const mine = run;
    timers.push(window.setTimeout(() => mine === run && fn(), ms));
  };
  const cancel = () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
    run++;
  };

  const read = (): Block[] => {
    if (blocks) return blocks;
    const payload = JSON.parse(unseal(section.dataset.sealed ?? '', section.dataset.key ?? '')) as { role: string; text: string };
    blocks = [];
    if (payload.role) blocks.push({ label: 'Role on file', words: payload.role.split(/\s+/) });
    payload.text
      .split(/\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .forEach((paragraph) => blocks!.push({ words: paragraph.split(/\s+/) }));
    return blocks;
  };

  /** Width of a word in ems, in the paragraph's own lettering, so the bars keep the true line breaks. */
  const ruler = (paragraph: HTMLElement) => {
    const style = getComputedStyle(paragraph);
    const context = document.createElement('canvas').getContext('2d');
    const size = parseFloat(style.fontSize) || 16;
    if (context) context.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
    return (word: string) => (context ? context.measureText(word).width / size : word.length * 0.45);
  };

  /** Lay the section out word by word: as empty bars, or as words waiting under their bars. */
  const draw = (mode: 'bars' | 'words') => {
    body.replaceChildren();
    for (const block of read()) {
      const paragraph = document.createElement('p');
      if (block.label) {
        paragraph.className = 'private-role';
        const label = document.createElement('span');
        label.className = 'typed private-role-label';
        label.textContent = block.label;
        paragraph.append(label, ' ');
      }
      body.append(paragraph);
      const measure = mode === 'bars' ? ruler(paragraph) : null;
      block.words.forEach((word, i) => {
        const bar = document.createElement('span');
        bar.className = 'rw';
        if (SENTENCE_END.test(word) && i < block.words.length - 1) bar.classList.add('rw--end');
        if (i > 0 && SENTENCE_END.test(block.words[i - 1])) bar.classList.add('rw--start');
        if (measure) bar.style.width = `${measure(word).toFixed(3)}em`;
        else bar.textContent = word;
        paragraph.append(bar);
        if (i < block.words.length - 1) paragraph.append(' ');
      });
    }
    return [...body.querySelectorAll<HTMLElement>('.rw')];
  };

  /** The finished state: ordinary paragraphs, readable, selectable and announced normally. */
  const drawPlain = () => {
    body.replaceChildren();
    for (const block of read()) {
      const paragraph = document.createElement('p');
      if (block.label) {
        paragraph.className = 'private-role';
        const label = document.createElement('span');
        label.className = 'typed private-role-label';
        label.textContent = block.label;
        paragraph.append(label, ' ');
      }
      paragraph.append(block.words.join(' '));
      body.append(paragraph);
    }
  };

  const stagger = (bars: HTMLElement[], sweep: number) =>
    bars.forEach((bar, i) => bar.style.setProperty('--d', `${Math.round((i / Math.max(1, bars.length - 1)) * sweep)}ms`));

  const showRedacted = () => {
    draw('bars');
    body.setAttribute('aria-hidden', 'true');
    note.hidden = false;
    confirm.checked = false;
    confirm.removeAttribute('aria-invalid');
    error.hidden = true;
    gate.hidden = false;
    after.hidden = true;
    setState('redacted');
  };

  const reveal = () => {
    if (state !== 'redacted') return;
    cancel();
    setState('revealing');
    gate.hidden = true;
    after.hidden = false;
    status.textContent = 'The private backstory is being unredacted.';
    head.focus({ preventScroll: true });
    head.scrollIntoView({ block: 'start', behavior: reduceMotion.matches ? 'auto' : 'smooth' });

    const finish = () => {
      drawPlain();
      body.removeAttribute('aria-hidden');
      note.hidden = true;
      setState('revealed');
      status.textContent = 'The private backstory is now unredacted and can be read.';
    };
    if (reduceMotion.matches) {
      section.classList.add('is-fading');
      finish();
      later(() => section.classList.remove('is-fading'), 260);
      return;
    }
    // Put the words in place under the bars, then draw the bars back in reading order.
    const bars = draw('words');
    const sweep = Math.min(2600, Math.max(1100, bars.length * 12));
    stagger(bars, sweep);
    later(() => {
      void body.offsetWidth;
      bars.forEach((bar) => bar.classList.add('is-clear'));
      later(finish, sweep + 260);
    }, 380); // let the page settle at the top of the section first
  };

  const reseal = () => {
    if (state !== 'revealed') return;
    cancel();
    const done = () => {
      showRedacted();
      status.textContent = 'The dossier has been resealed.';
      confirm.focus({ preventScroll: true });
    };
    if (reduceMotion.matches) {
      section.classList.add('is-fading');
      done();
      later(() => section.classList.remove('is-fading'), 260);
      return;
    }
    setState('resealing');
    const bars = draw('words');
    bars.forEach((bar) => bar.classList.add('is-clear'));
    const sweep = 420;
    stagger(bars, sweep);
    void body.offsetWidth;
    bars.forEach((bar) => bar.classList.remove('is-clear'));
    later(done, sweep + 240);
  };

  gate.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!confirm.checked) {
      error.hidden = false;
      confirm.setAttribute('aria-invalid', 'true');
      confirm.focus();
      return;
    }
    reveal();
  });
  confirm.addEventListener('change', () => {
    if (!confirm.checked) return;
    error.hidden = true;
    confirm.removeAttribute('aria-invalid');
  });
  resealButton.addEventListener('click', reseal);

  return {
    /** Draw the bars for a file that has just been opened. */
    open() {
      cancel();
      const mine = run;
      const ready = document.fonts?.ready ?? Promise.resolve();
      // Bars are measured in the page's own lettering, so wait until it has loaded.
      ready.then(() => mine === run && showRedacted());
    },
    /** A file that is closed keeps nothing readable in the page. */
    close() {
      cancel();
      body.replaceChildren();
      body.setAttribute('aria-hidden', 'true');
      note.hidden = false;
      confirm.checked = false;
      confirm.removeAttribute('aria-invalid');
      error.hidden = true;
      gate.hidden = false;
      after.hidden = true;
      status.textContent = '';
      section.classList.remove('is-fading');
      setState('redacted');
    },
  };
}

export function initRedaction() {
  const controllers = new Map<HTMLElement, ReturnType<typeof createController>>();
  document.querySelectorAll<HTMLElement>('[data-private]').forEach((section) => controllers.set(section, createController(section)));
  let current: HTMLElement | undefined;

  return {
    /** Called when the open dossier changes. Every dossier starts redacted, each time it is opened. */
    show(dossier: HTMLElement | undefined) {
      if (dossier === current) return;
      current = dossier;
      controllers.forEach((controller, section) => {
        controller.close();
        if (dossier?.contains(section)) controller.open();
      });
    },
  };
}
