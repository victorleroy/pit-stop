const MUTE_KEY = 'pit-stop.timer-muted';

export const readTimerMuted = () => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
};

export const saveTimerMuted = (muted: boolean) => {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Nothing to do: the choice just will not survive a reload.
  }
};

let context: AudioContext | undefined;

const getContext = () => {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Ctor) return undefined;
  try {
    context = new Ctor();
  } catch {
    context = undefined;
  }
  return context;
};

/** Browsers keep audio suspended until the page was touched: the first gesture lifts that. */
export const unlockTimerSound = () => {
  void getContext()?.resume().catch(() => undefined);
};

export const playTimerChime = () => {
  const audio = getContext();
  if (!audio) return;

  const ring = () => {
    const start = audio.currentTime;
    [660, 880, 1320].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const at = start + index * 0.18;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.55);
    });
  };

  try {
    if (audio.state === 'suspended') {
      void audio.resume().then(() => {
        if (audio.state === 'running') ring();
      }, () => undefined);
    } else {
      ring();
    }
  } catch {
    // Blocked or unsupported audio must never break the timer.
  }
};

const CLACK_SECONDS = 0.06;
const CLACK_VOLUME = 0.15;

/** The "clack" of an impact wrench: 60 ms of filtered noise, no audio file. */
export const playWrenchClack = () => {
  const audio = getContext();
  if (!audio) return;

  if (audio.state === 'suspended') {
    void audio.resume().then(() => {
      if (audio.state === 'running') playWrenchClack();
    }, () => undefined);
    return;
  }

  if (audio.state !== 'running') return;

  try {
    const length = Math.ceil(audio.sampleRate * CLACK_SECONDS);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      samples[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }

    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    const at = audio.currentTime;

    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 1.4;
    gain.gain.setValueAtTime(CLACK_VOLUME, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + CLACK_SECONDS);
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(at);
  } catch {
    // Blocked or unsupported audio must never break the game.
  }
};
