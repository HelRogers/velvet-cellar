// Background music: the host's chosen track, which starts when the guest breaks
// the seal on the invitation and loops until they turn it off.
//
// Browsers only allow sound after the visitor has tapped or pressed something,
// so the music is always started from inside such a gesture: the seal, the skip
// button, or (for a guest returning to an already opened invitation) their first
// tap on the page. The guest's choice to turn it off is remembered.

const KEY = 'velvet-cellar:music';

type Preference = 'on' | 'off' | null;

const readPreference = (): Preference => {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'on' || value === 'off' ? value : null;
  } catch {
    return null;
  }
};
const savePreference = (value: 'on' | 'off') => {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* private browsing: the choice lasts for this visit only */
  }
};

export function initMusic() {
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-music-toggle]')];
  const source = root.dataset.musicSrc;
  if (!source || buttons.length === 0) return;

  const volume = Math.min(1, Math.max(0, Number(root.dataset.musicVolume) || 0.9));
  let audio: HTMLAudioElement | null = null;
  let fade = 0;
  let resumeWhenVisible = false;
  let disarm = () => {};

  const show = (playing: boolean) => {
    root.dataset.music = playing ? 'playing' : 'paused';
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(playing));
      const label = button.querySelector('[data-music-label]');
      if (label) label.textContent = playing ? 'Turn the music off' : 'Turn the music on';
    }
  };

  const player = () => {
    if (!audio) {
      audio = new Audio(source);
      audio.loop = true;
      audio.preload = 'auto';
      audio.addEventListener('pause', () => show(false));
      audio.addEventListener('playing', () => {
        disarm();
        show(true);
      });
    }
    return audio;
  };

  /** Must be called from inside a tap or key press, or the browser will refuse. */
  const play = () => {
    const track = player();
    if (!track.paused) return;
    window.clearInterval(fade);
    // A short swell rather than a sudden blast. (iPhones ignore this and use the phone's own volume.)
    track.volume = volume * 0.25;
    fade = window.setInterval(() => {
      track.volume = Math.min(volume, track.volume + volume * 0.075);
      if (track.volume >= volume) window.clearInterval(fade);
    }, 60);
    track.play().catch(() => {
      window.clearInterval(fade);
      show(false);
    });
  };
  const pause = () => {
    window.clearInterval(fade);
    audio?.pause();
    show(false);
  };
  const isPlaying = () => Boolean(audio && !audio.paused);

  show(false);

  // The on/off button. Turning it off is remembered; so is turning it back on.
  for (const button of buttons) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (isPlaying()) {
        savePreference('off');
        pause();
      } else {
        savePreference('on');
        play();
      }
    });
  }

  const wanted = () => readPreference() !== 'off';

  // Breaking the seal (or skipping, or replaying the opening) starts the music.
  for (const opener of document.querySelectorAll('[data-open], [data-skip], [data-replay]')) {
    opener.addEventListener('click', () => wanted() && play());
  }

  // A guest who comes back to an already opened invitation: the music joins in at their first tap,
  // click or key press. A swipe to scroll does not count for the browser, so keep listening until it starts.
  if (root.dataset.invite === 'opened' && wanted()) {
    const kinds = ['click', 'touchend', 'keydown'] as const;
    const begin = (event: Event) => {
      if (!wanted() || isPlaying()) return disarm();
      if (event instanceof KeyboardEvent && ['Tab', 'Shift', 'Escape', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-music-toggle], [data-music-pause]')) return disarm();
      play();
    };
    disarm = () => {
      kinds.forEach((kind) => window.removeEventListener(kind, begin, true));
      disarm = () => {};
    };
    kinds.forEach((kind) => window.addEventListener(kind, begin, true));
  }

  // Opening a Spotify playlist: step aside so two tunes never play at once.
  for (const link of document.querySelectorAll('[data-music-pause]')) {
    link.addEventListener('click', pause);
  }

  // Leaving the page (another app, another tab) pauses it; coming back picks it up again.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resumeWhenVisible = isPlaying();
      if (resumeWhenVisible) audio?.pause();
    } else if (resumeWhenVisible && wanted()) {
      resumeWhenVisible = false;
      play();
    }
  });
}
