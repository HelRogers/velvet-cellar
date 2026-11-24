/**
 * The Sealed Invitation: opening sequence, card turning and the enlarged view.
 *
 * State lives on <html data-invite="sealed | opening | opened"> so the first
 * paint is already correct (see the inline script in Base.astro).
 * The opening is a deterministic sequence of Web Animations; nothing here
 * touches the invitation artwork beyond moving the two original images.
 */

type Face = 'front' | 'back';
type State = 'sealed' | 'opening' | 'opened';

interface FaceData {
  src: string;
  srcset: string;
  alt: string;
  width: number;
  height: number;
}

const STORAGE_KEY = 'velvet-cellar:invitation-opened';
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
const EASE_PAPER = 'cubic-bezier(0.6, 0.05, 0.2, 1)';
const FLAP = 'perspective(1500px)';
const SEAL_BROKEN = 'translate(1.5px, 3px) rotate(2.4deg) scale(1)';

const remembered = {
  set() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* private browsing or blocked storage: the opening simply plays again next time */
    }
  },
};

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function initInvitation() {
  const root = document.documentElement;
  const section = document.querySelector<HTMLElement>('[data-threshold]');
  const dataEl = document.getElementById('invitation-data');
  if (!section || !dataEl) return;

  const one = <T extends HTMLElement = HTMLElement>(selector: string) => section.querySelector<T>(selector)!;
  const all = <T extends HTMLElement = HTMLElement>(selector: string) =>
    Array.from(section.querySelectorAll<T>(selector));

  const faces: Record<Face, FaceData> = JSON.parse(dataEl.textContent || '{}');

  const sealedLayer = one('[data-sealed-layer]');
  const envelope = one('[data-envelope]');
  const pieces = all('[data-env-piece]');
  const flap = one('[data-flap]');
  const flapShadow = one('[data-flap-shadow]');
  const sealLower = one('[data-seal-lower]');
  const crumbs = all('[data-crumb]');
  const intro = all('[data-intro]');
  const openButton = one<HTMLButtonElement>('[data-open]');
  const skipButton = one<HTMLButtonElement>('[data-skip]');

  const rig = one('[data-card-rig]');
  const lift = one('[data-card-lift]');
  const faceFront = one('[data-face-front]');
  const faceBack = one('[data-face-back]');
  const cardHit = one<HTMLButtonElement>('.card-hit');
  const controls = one('[data-viewer-controls]');
  const turnButton = one<HTMLButtonElement>('[data-turn]');
  const replayButton = one<HTMLButtonElement>('[data-replay]');
  const announcer = one('[data-announce]');

  const lightbox = one<HTMLDialogElement>('[data-lightbox]');
  const lightboxScroll = one('[data-lightbox-scroll]');
  const lightboxImg = one<HTMLImageElement>('[data-lightbox-img]');
  const lightboxFace = one('[data-lightbox-face]');
  const zoomIn = one<HTMLButtonElement>('[data-zoom-in]');
  const zoomOut = one<HTMLButtonElement>('[data-zoom-out]');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let state: State = (root.dataset.invite as State) || 'opened';
  let face: Face = 'front';
  let geometry: { dx: number; dy: number; scale: number; lift: number; drop: number } | null = null;
  let run = 0; // increments whenever a sequence is finished or abandoned
  let animations: Animation[] = [];

  /* ---------- helpers ---------- */

  function play(el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = el.animate(keyframes, { fill: 'forwards', ...options });
    animations.push(animation);
    return animation;
  }

  function clearAnimations() {
    animations.forEach((animation) => animation.cancel());
    animations = [];
  }

  function announce(message: string) {
    announcer.textContent = '';
    window.setTimeout(() => (announcer.textContent = message), 60);
  }

  function setState(next: State) {
    state = next;
    root.dataset.invite = next;
    const sealed = next === 'sealed';
    const opened = next === 'opened';
    sealedLayer.inert = opened;
    skipButton.disabled = !sealed;
    controls.inert = !opened;
    cardHit.disabled = !opened;
  }

  const transform = (x: number, y: number, rotate: number, scale: number) =>
    `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rotate}deg) scale(${scale.toFixed(4)})`;

  /** Tuck the card inside the envelope: on its side, as it would sit in a real one. */
  function placeCardInEnvelope() {
    rig.style.transform = 'none';
    const card = rig.getBoundingClientRect();
    const env = envelope.getBoundingClientRect();
    const bounds = section.getBoundingClientRect();
    if (!card.width || !env.width) return;
    const scale = (env.width * 0.9) / card.height;
    const dx = env.left + env.width / 2 - (card.left + card.width / 2);
    const dy = env.top + env.height / 2 - (card.top + card.height / 2);
    const onItsSide = card.width * scale; // the card's height on screen while rotated
    const room = env.top + env.height / 2 - onItsSide / 2 - (bounds.top + 12);
    geometry = {
      dx,
      dy,
      scale,
      lift: Math.max(env.height * 0.55, Math.min(env.height * 0.98, room)),
      drop: bounds.bottom - env.top + env.height * 0.7,
    };
    rig.style.transform = transform(dx, dy, -90, scale);
    rig.classList.add('is-placed');
  }

  async function imagesReady() {
    const images = [faceFront, faceBack].map((el) => el.querySelector('img')!);
    await Promise.race([
      Promise.all(images.map((img) => (img.complete ? img.decode().catch(() => {}) : new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      })))),
      wait(3000),
    ]);
  }

  /* ---------- the opening ---------- */

  function settleOpened(moveFocus: boolean) {
    run++;
    clearAnimations();
    rig.style.transform = '';
    rig.style.zIndex = '';
    rig.style.visibility = '';
    flap.style.zIndex = '';
    rig.classList.remove('is-placed', 'is-free');
    setState('opened');
    remembered.set();
    if (moveFocus) turnButton.focus({ preventScroll: true });
    announce('Your invitation is open. Turn the card over to read the back.');
  }

  async function fadeOpen() {
    const id = ++run;
    rig.style.visibility = 'hidden';
    await play(sealedLayer, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease' }).finished.catch(() => {});
    if (id !== run) return;
    settleOpened(true);
    rig.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease' });
  }

  async function open() {
    if (state === 'opening') {
      // A second press during the opening goes straight to the invitation.
      settleOpened(true);
      return;
    }
    if (state !== 'sealed') return;
    setState('opening');
    const id = ++run;
    if (!geometry) placeCardInEnvelope();
    await imagesReady();
    if (id !== run) return;
    if (reduceMotion.matches || !geometry) {
      fadeOpen();
      return;
    }
    const g = geometry;

    // 1. The seal gives way along the edge of the flap.
    intro.forEach((el) => play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease' }));
    play(
      sealLower,
      [
        { transform: 'translate(0, 0) rotate(0deg) scale(0.97)' },
        { transform: 'translate(0, -1px) rotate(0deg) scale(1)', offset: 0.3 },
        { transform: SEAL_BROKEN },
      ],
      { duration: 460, easing: EASE_OUT }
    );
    crumbs.forEach((crumb, i) => {
      const side = i % 2 ? 1 : -1;
      const reach = 10 + i * 7;
      play(
        crumb,
        [
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 0 },
          { opacity: 1, offset: 0.12 },
          { transform: `translate(${side * reach}px, ${26 + i * 9}px) rotate(${side * 140}deg)`, opacity: 0 },
        ],
        { duration: 700 + i * 90, delay: 120 + i * 40, easing: 'cubic-bezier(0.3, 0, 0.7, 0.6)' }
      );
    });
    await wait(520);
    if (id !== run) return;

    // 2. The flap lifts and folds back, carrying its half of the seal with it.
    play(flapShadow, [{ opacity: 0.55 }, { opacity: 0 }], { duration: 620, easing: 'ease-out' });
    const flapOpen = play(
      flap,
      [{ transform: `${FLAP} rotateX(0deg)` }, { transform: `${FLAP} rotateX(180deg)` }],
      { duration: 1350, easing: EASE_IN_OUT }
    );
    window.setTimeout(() => {
      if (id === run) flap.style.zIndex = '1'; // past upright: now behind the card
    }, 1350 * 0.5);
    await flapOpen.finished.catch(() => {});
    if (id !== run) return;

    // 3. The invitation slides slowly out of the envelope.
    const tucked = transform(g.dx, g.dy, -90, g.scale);
    const drawn = transform(g.dx, g.dy - g.lift, -90, g.scale);
    await play(rig, [{ transform: tucked }, { transform: drawn }], {
      duration: 1550,
      easing: 'cubic-bezier(0.33, 0, 0.15, 1)',
    }).finished.catch(() => {});
    if (id !== run) return;

    // 4. It turns upright and settles, while the envelope slips away below.
    rig.style.zIndex = '6';
    rig.classList.add('is-free');
    const drop = `translateY(${g.drop.toFixed(0)}px)`;
    pieces.forEach((piece) => {
      // The flap stays folded back, and the broken seal stays askew, as they travel with the rest.
      const held =
        piece === flap ? ` ${FLAP} rotateX(180deg)` : piece === sealLower ? ` ${SEAL_BROKEN}` : '';
      play(piece, [{ transform: `translateY(0px)${held}` }, { transform: `${drop}${held}` }], {
        duration: 1300,
        easing: 'cubic-bezier(0.6, 0, 0.8, 0.5)',
      });
    });
    await play(rig, [{ transform: drawn }, { transform: transform(0, 0, 0, 1) }], {
      duration: 1500,
      easing: EASE_PAPER,
    }).finished.catch(() => {});
    if (id !== run) return;

    settleOpened(true);
  }

  function skip() {
    if (state !== 'sealed') return;
    setState('opening');
    fadeOpen();
  }

  function replay() {
    if (state !== 'opened') return;
    run++;
    clearAnimations();
    section.classList.add('no-anim');
    setFace('front', true);
    setState('sealed');
    window.scrollTo({ top: 0 });
    placeCardInEnvelope();
    requestAnimationFrame(() => requestAnimationFrame(() => section.classList.remove('no-anim')));
    if (!reduceMotion.matches) {
      sealedLayer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease' });
    }
    openButton.focus({ preventScroll: true });
    announce('The invitation is sealed again.');
  }

  /* ---------- turning the card ---------- */

  function setFace(next: Face, quiet = false) {
    face = next;
    section.dataset.face = next;
    faceFront.setAttribute('aria-hidden', String(next !== 'front'));
    faceBack.setAttribute('aria-hidden', String(next !== 'back'));
    if (lightbox.open) showInLightbox(true);
    if (!quiet) announce(next === 'back' ? 'Showing the back of the invitation.' : 'Showing the front of the invitation.');
  }

  function turn() {
    setFace(face === 'front' ? 'back' : 'front');
    if (!reduceMotion.matches && !lightbox.open) {
      lift.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.035)', offset: 0.45 }, { transform: 'scale(1)' }],
        { duration: 950, easing: 'ease-in-out' }
      );
    }
  }

  // A sideways swipe on the card also turns it; a plain tap enlarges it.
  let swipeStart: { x: number; y: number } | null = null;
  let swiped = false;
  cardHit.addEventListener('pointerdown', (event) => {
    swipeStart = { x: event.clientX, y: event.clientY };
    swiped = false;
  });
  cardHit.addEventListener('pointerup', (event) => {
    if (!swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.8) {
      swiped = true;
      turn();
    }
  });
  cardHit.addEventListener('pointercancel', () => (swipeStart = null));

  /* ---------- the enlarged view ---------- */

  const ZOOMS = [1, 1.8, 2.6, 3.6];
  let zoom = 0;
  let startZoom = 0;

  const fitWidth = () => Math.max(240, Math.min(lightboxScroll.clientWidth - 24, 1100));

  function applyZoom(focus?: { x: number; y: number }) {
    const previousWidth = lightboxImg.clientWidth || 1;
    const previousHeight = lightboxImg.clientHeight || 1;
    // The point (as a fraction of the image) to keep in the middle of the view.
    const point = focus ?? {
      x: (lightboxScroll.scrollLeft + lightboxScroll.clientWidth / 2 - lightboxImg.offsetLeft) / previousWidth,
      y: (lightboxScroll.scrollTop + lightboxScroll.clientHeight / 2 - lightboxImg.offsetTop) / previousHeight,
    };
    const width = Math.round(fitWidth() * ZOOMS[zoom]);
    const height = width * (faces[face].height / faces[face].width);
    lightboxImg.style.width = `${width}px`;
    lightboxImg.sizes = `${width}px`;
    lightboxScroll.scrollLeft = lightboxImg.offsetLeft + point.x * width - lightboxScroll.clientWidth / 2;
    lightboxScroll.scrollTop = lightboxImg.offsetTop + point.y * height - lightboxScroll.clientHeight / 2;
    zoomOut.disabled = zoom === 0;
    zoomIn.disabled = zoom === ZOOMS.length - 1;
    lightboxImg.style.cursor = zoom === ZOOMS.length - 1 ? 'zoom-out' : 'zoom-in';
  }

  function showInLightbox(swap = false) {
    const data = faces[face];
    const set = () => {
      lightboxImg.width = data.width;
      lightboxImg.height = data.height;
      lightboxImg.srcset = data.srcset;
      lightboxImg.src = data.src;
      lightboxImg.alt = data.alt;
      lightboxFace.textContent = face;
    };
    if (swap && !reduceMotion.matches) {
      lightboxImg.classList.add('is-swapping');
      window.setTimeout(() => {
        set();
        lightboxImg.classList.remove('is-swapping');
      }, 180);
    } else {
      set();
    }
  }

  function enlarge() {
    if (swiped) {
      swiped = false;
      return;
    }
    if (state !== 'opened' || lightbox.open) return;
    showInLightbox();
    lightbox.showModal();
    // Small screens start zoomed in: at "fit" the card is no larger than it already was.
    startZoom = lightboxScroll.clientWidth < 700 ? 1 : 0;
    zoom = startZoom;
    applyZoom({ x: 0.5, y: 0 });
    lightboxScroll.scrollTop = 0;
  }

  function stepZoom(direction: 1 | -1, focus?: { x: number; y: number }) {
    const next = Math.min(ZOOMS.length - 1, Math.max(0, zoom + direction));
    if (next === zoom) return;
    zoom = next;
    applyZoom(focus);
  }

  lightboxImg.addEventListener('click', (event) => {
    const box = lightboxImg.getBoundingClientRect();
    const focus = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
    if (zoom === ZOOMS.length - 1) {
      zoom = startZoom;
      applyZoom(focus);
    } else {
      stepZoom(1, focus);
    }
  });
  zoomIn.addEventListener('click', () => stepZoom(1));
  zoomOut.addEventListener('click', () => stepZoom(-1));
  one('[data-lightbox-turn]').addEventListener('click', turn);
  one('[data-lightbox-close]').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('keydown', (event) => {
    if (event.key === '+' || event.key === '=') stepZoom(1);
    if (event.key === '-' || event.key === '_') stepZoom(-1);
  });

  /* ---------- wiring ---------- */

  openButton.addEventListener('click', open);
  skipButton.addEventListener('click', skip);
  replayButton.addEventListener('click', replay);
  turnButton.addEventListener('click', turn);
  all('[data-enlarge]').forEach((el) => el.addEventListener('click', enlarge));

  // Keep the tucked card aligned with the envelope while the layout settles or changes.
  let frame = 0;
  const realign = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (state === 'sealed') placeCardInEnvelope();
      if (lightbox.open) applyZoom();
    });
  };
  window.addEventListener('resize', realign);
  window.addEventListener('load', realign);
  document.fonts?.ready.then(realign);

  setFace('front', true);
  setState(state === 'opening' ? 'sealed' : state);
  if (state === 'sealed') placeCardInEnvelope();
}
