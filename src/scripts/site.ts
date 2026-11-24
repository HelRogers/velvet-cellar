/**
 * Behaviour for everything beyond the invitation: navigation, the countdown,
 * the reservation slip, the archive search, dossiers and the photograph viewer.
 *
 * Rule for every feature here: never report success that did not happen. Where
 * something is not connected (in the private preview, or before the host has
 * supplied a link) the page says so.
 */

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
/** True in the private review copy, which is not served by Netlify. */
const isPreview = root.hasAttribute('data-preview');

const one = <T extends HTMLElement = HTMLElement>(selector: string, scope: ParentNode = document) =>
  scope.querySelector<T>(selector);
const all = <T extends HTMLElement = HTMLElement>(selector: string, scope: ParentNode = document) =>
  Array.from(scope.querySelectorAll<T>(selector));

/* ---------- Navigation ---------- */

function initNav() {
  const threshold = one('[data-threshold]');
  const menu = one<HTMLDialogElement>('[data-nav-menu]');
  if (!threshold) return;

  const update = () => {
    const past = threshold.getBoundingClientRect().bottom < 96;
    if (past) root.dataset.nav = 'shown';
    else delete root.dataset.nav;
  };
  let frame = 0;
  window.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    },
    { passive: true }
  );
  window.addEventListener('resize', update);
  update();

  if (!menu) return;
  one('[data-nav-open]')?.addEventListener('click', () => menu.showModal());
  one('[data-nav-close]', menu)?.addEventListener('click', () => menu.close());
  all('[data-nav-link]', menu).forEach((link) => link.addEventListener('click', () => menu.close()));
}

/* ---------- The countdown ---------- */

function initCountdown() {
  const section = one('[data-countdown]');
  if (!section) return;
  const target = Date.parse(section.dataset.target ?? '');
  if (Number.isNaN(target)) return;

  const running = one('[data-countdown-running]', section)!;
  const open = one('[data-countdown-open]', section)!;
  const summary = one('[data-countdown-summary]', section)!;
  const cells = Object.fromEntries(all('[data-unit]', section).map((el) => [el.dataset.unit!, el]));
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  let lastMinute = -1;
  let timer = 0;

  const tick = () => {
    const remaining = target - Date.now();
    if (remaining <= 0) {
      running.hidden = true;
      open.hidden = false;
      window.clearInterval(timer);
      return;
    }
    const seconds = Math.floor(remaining / 1000);
    const parts = {
      days: Math.floor(seconds / 86400),
      hours: Math.floor((seconds % 86400) / 3600),
      minutes: Math.floor((seconds % 3600) / 60),
      seconds: seconds % 60,
    };
    for (const [unit, value] of Object.entries(parts)) {
      const text = String(value).padStart(2, '0');
      if (cells[unit] && cells[unit].textContent !== text) cells[unit].textContent = text;
    }
    // Screen readers get a plain sentence, refreshed once a minute rather than every second.
    if (parts.minutes !== lastMinute) {
      lastMinute = parts.minutes;
      summary.textContent = `${plural(parts.days, 'day')}, ${plural(parts.hours, 'hour')} and ${plural(parts.minutes, 'minute')} until the doors open.`;
    }
  };
  tick();
  timer = window.setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => !document.hidden && tick());
}

/* ---------- The Evening's Particulars ---------- */

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and some embedded views: fall back to a temporary field.
    try {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.append(field);
      field.select();
      const done = document.execCommand('copy');
      field.remove();
      return done;
    } catch {
      return false;
    }
  }
}

function initParticulars() {
  const button = one<HTMLButtonElement>('[data-copy-address]');
  const status = one('[data-copy-status]');
  if (button && status) {
    const label = one('[data-copy-label]', button)!;
    const original = label.textContent ?? '';
    let reset = 0;
    button.addEventListener('click', async () => {
      const address = button.dataset.copyAddress ?? '';
      const copied = await copyText(address);
      window.clearTimeout(reset);
      status.textContent = '';
      window.setTimeout(() => {
        status.textContent = copied
          ? `Copied: ${address}`
          : `Copying is not available here. The address is ${address}.`;
      }, 40);
      if (copied) {
        label.textContent = 'Address copied';
        reset = window.setTimeout(() => (label.textContent = original), 2600);
      }
    });
  }

  // The calendar file is served by the live site; the private preview cannot offer it.
  if (isPreview) {
    all<HTMLAnchorElement>('[data-live-only]').forEach((link) => {
      const stand = document.createElement('span');
      stand.className = `${link.className} is-awaiting`;
      stand.setAttribute('aria-disabled', 'true');
      stand.innerHTML = link.innerHTML;
      const note = document.createElement('span');
      note.className = 'typed placeholder-note live-only-note';
      note.textContent = 'Works on the live site, not in this preview';
      link.replaceWith(stand, note);
    });
  }
}

/* ---------- The reservation slip (RSVP) ---------- */

function initRsvp() {
  const dialog = one<HTMLDialogElement>('[data-rsvp-dialog]');
  const form = one<HTMLFormElement>('[data-rsvp-form]');
  if (!dialog || !form) return;

  const submit = one<HTMLButtonElement>('[data-rsvp-submit]', form)!;
  const error = one('[data-rsvp-error]', form)!;
  const result = one('[data-rsvp-result]', dialog)!;
  const resultText = one('[data-rsvp-result-text]', dialog)!;
  const nameField = form.elements.namedItem('name') as HTMLInputElement;
  const nameError = one('#rsvp-name-error', form)!;
  const attendingError = one('#rsvp-attending-error', form)!;
  const submitLabel = submit.textContent ?? '';
  const connected = form.dataset.rsvpMode === 'live' && !isPreview;

  const showError = (message: string) => {
    error.textContent = message;
    error.hidden = false;
  };

  // Every RSVP control (beneath the particulars, in the bar, in the menu) opens the same slip.
  all('[data-rsvp-open]').forEach((opener) =>
    opener.addEventListener('click', () => {
      const menu = one<HTMLDialogElement>('[data-nav-menu]');
      if (menu?.open) menu.close();
      form.hidden = false;
      result.hidden = true;
      error.hidden = true;
      dialog.showModal();
      nameField.focus();
    })
  );
  all('[data-rsvp-close]', dialog).forEach((el) => el.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (event) => event.target === dialog && dialog.close());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;

    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const attending = String(data.get('attending') ?? '');
    nameError.hidden = name.length > 0;
    attendingError.hidden = attending.length > 0;
    nameField.setAttribute('aria-invalid', String(name.length === 0));
    if (!name) {
      nameField.focus();
      return;
    }
    if (!attending) {
      (form.elements.namedItem('attending') as RadioNodeList)[0] instanceof HTMLElement &&
        ((form.elements.namedItem('attending') as RadioNodeList)[0] as HTMLElement).focus();
      return;
    }

    if (!connected) {
      showError(
        'This is a preview, so the reservations book is not connected. Nothing has been sent. On the live site this slip goes straight to the hosts.'
      );
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Sending…';
    try {
      const response = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(data as unknown as Record<string, string>).toString(),
      });
      if (!response.ok) throw new Error(`The server answered ${response.status}`);
      resultText.textContent =
        attending === 'Attending'
          ? 'Your place at The Velvet Cellar has been reserved. Further confidential correspondence will follow.'
          : 'Your response has been received. You will be missed at The Velvet Cellar.';
      form.hidden = true;
      result.hidden = false;
      result.focus();
      form.reset();
    } catch {
      showError(
        'Your response could not be sent. Please check your connection and try again, or reply to the invitation email instead.'
      );
    } finally {
      submit.disabled = false;
      submit.textContent = submitLabel;
    }
  });
}

/* ---------- The Confidential Archives ---------- */

function initArchives() {
  const search = one<HTMLInputElement>('[data-archive-search]');
  if (!search) return;
  const items = all('[data-archive-item]');
  const blanks = all('[data-archive-blank]');
  const count = one('[data-archive-count]')!;
  const empty = one('[data-archive-empty]')!;

  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    let found = 0;
    items.forEach((item) => {
      const match = !query || (item.dataset.search ?? '').includes(query);
      item.hidden = !match;
      if (match) found++;
    });
    blanks.forEach((blank) => (blank.hidden = Boolean(query)));
    empty.hidden = !query || found > 0;
    count.textContent = query ? (found === 1 ? '1 file found' : `${found} files found`) : '';
  });
}

/* ---------- Dossiers ----------
   A dossier is addressed by its hash (#dossier-kitty-adams), so the browser's
   back button closes it and the link can be shared between a guest's devices. */

function initDossiers() {
  const dossiers = all('[data-dossier]');
  if (!dossiers.length) return;
  const backdrop = all('main, .site-nav, .beyond-footer');
  let lastOpened: string | null = null;

  const sync = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = root.dataset.invite === 'opened' ? dossiers.find((dossier) => dossier.id === id) : undefined;
    dossiers.forEach((dossier) => (dossier.hidden = dossier !== target));
    backdrop.forEach((el) => (el.inert = Boolean(target)));
    if (target) {
      root.dataset.view = 'dossier';
      lastOpened = target.id;
      target.scrollTop = 0;
      const heading = one('h2', target);
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
    } else {
      delete root.dataset.view;
      if (lastOpened) {
        // Hand focus back to the file the guest opened.
        one(`a[href="#${lastOpened}"]`)?.focus({ preventScroll: true });
        lastOpened = null;
      }
    }
  };

  window.addEventListener('hashchange', sync);
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-invite'] });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.dataset.view === 'dossier') location.hash = '#archives';
  });
  sync();
}

/* ---------- The photograph viewer (mood boards) ---------- */

function initGallery() {
  const dialog = one<HTMLDialogElement>('[data-gallery]');
  if (!dialog) return;
  const track = one('[data-gallery-track]', dialog)!;
  const count = one('[data-gallery-count]', dialog)!;
  const caption = one('[data-gallery-caption]', dialog)!;
  let plates: HTMLElement[] = [];
  let index = 0;

  const ratioOf = (value: string) => {
    const [w, h] = value.split('/').map(Number);
    return w && h ? w / h : 1;
  };

  const show = (next: number, smooth = true) => {
    index = Math.max(0, Math.min(plates.length - 1, next));
    track.scrollTo({ left: index * track.clientWidth, behavior: smooth && !reduceMotion.matches ? 'smooth' : 'auto' });
    describe();
  };
  const describe = () => {
    count.textContent = `${index + 1} of ${plates.length}`;
    caption.textContent = plates[index]?.dataset.caption ?? '';
  };

  all('[data-board]').forEach((board) => {
    const boardPlates = all('[data-plate]', board);
    boardPlates.forEach((plate, i) =>
      plate.addEventListener('click', () => {
        plates = boardPlates;
        track.replaceChildren(
          ...plates.map((item) => {
            const slide = document.createElement('div');
            slide.className = 'gallery-slide';
            if (item.dataset.large) {
              const img = document.createElement('img');
              img.src = item.dataset.large;
              img.alt = item.dataset.alt ?? '';
              img.decoding = 'async';
              slide.append(img);
            } else {
              const ratio = ratioOf(item.dataset.ratio ?? '1/1');
              const blank = document.createElement('div');
              blank.className = 'gallery-blank';
              blank.style.aspectRatio = String(ratio);
              blank.style.width = `min(100%, calc((100dvh - 11rem) * ${ratio.toFixed(4)}))`;
              blank.textContent = 'Placeholder. The host will choose this photograph.';
              slide.append(blank);
            }
            return slide;
          })
        );
        dialog.showModal();
        show(i, false);
        track.focus({ preventScroll: true });
      })
    );
  });

  let frame = 0;
  track.addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const current = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
        if (current !== index) {
          index = current;
          describe();
        }
      });
    },
    { passive: true }
  );
  one('[data-gallery-prev]', dialog)?.addEventListener('click', () => show(index - 1));
  one('[data-gallery-next]', dialog)?.addEventListener('click', () => show(index + 1));
  one('[data-gallery-close]', dialog)?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });
  window.addEventListener('resize', () => dialog.open && show(index, false));
}

export function initSite() {
  initNav();
  initCountdown();
  initParticulars();
  initRsvp();
  initArchives();
  initDossiers();
  initGallery();
}
