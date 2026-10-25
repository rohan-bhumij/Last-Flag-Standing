export interface AudioMixerConfig {
  muted: boolean;
  masterVolume: number; // 0..1
  commentaryVolume: number; // 0..1
  musicVolume: number; // 0..1
  impactsVolume: number; // 0..1
  hazardVolume: number; // 0..1
  alertsVolume: number; // 0..1
  voiceName: 'Aria' | 'Sonia' | 'Natasha' | 'Kore' | 'Fenrir' | 'Puck' | 'Charon' | 'Zephyr';
  preferServerTts: boolean;
}

export interface SpeechQueueItem {
  id: string;
  text: string;
  priority: 'WINNER' | 'ELIMINATION' | 'COMMUNITY';
  countryName?: string;
  remainingAfter?: number;
  createdAt: number;
  prefetchedTts?: Promise<{
    audioBase64?: string;
    mimeType?: string;
    provider?: string;
  } | null>;
}

export interface CommentaryDiagnostics {
  pendingCount: number;
  completedCount: number;
  errorCount: number;
  isSpeaking: boolean;
  activeText: string | null;
  lastProvider: 'FREE_NEURAL_TTS' | 'GEMINI_TTS' | 'WEB_SPEECH_SYNTH' | 'WEB_AUDIO_FORMANT' | 'NONE';
  lastError: string | null;
  recentHistory: Array<{
    id: string;
    text: string;
    provider: string;
    timestamp: number;
  }>;
}

class ArenaSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private duckingGain: GainNode | null = null;
  private ambienceOsc: OscillatorNode | null = null;
  private ambienceGain: GainNode | null = null;

  private config: AudioMixerConfig = {
    muted: false,
    masterVolume: 0.85,
    commentaryVolume: 1.0,
    musicVolume: 0.35,
    impactsVolume: 0.55,
    hazardVolume: 0.75,
    alertsVolume: 0.85,
    voiceName: 'Aria',
    preferServerTts: true, // Uses 100% free realistic neural voice stream by default!
  };

  private lastCollisionSoundAt = 0;
  private lastPerimeterSoundAt = 0;
  private lastDeflectorSoundAt = 0;

  private speechQueue: SpeechQueueItem[] = [];
  private processedSpeechIds = new Set<string>();
  private isProcessingSpeech = false;
  private diagnostics: CommentaryDiagnostics = {
    pendingCount: 0,
    completedCount: 0,
    errorCount: 0,
    isSpeaking: false,
    activeText: null,
    lastProvider: 'NONE',
    lastError: null,
    recentHistory: [],
  };
  private listeners = new Set<() => void>();

  private hasUserActivated = false;
  private eliminationWavUri: string | null = null;
  private pendingAutoplayItem: SpeechQueueItem | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.eliminationWavUri = this.buildEliminationStingWavUri();
      const unlock = () => {
        const wasActivated = this.hasUserActivated;
        this.hasUserActivated = true;
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        if (!wasActivated && this.pendingAutoplayItem && !this.isProcessingSpeech) {
          const retry = this.pendingAutoplayItem;
          this.pendingAutoplayItem = null;
          this.processedSpeechIds.delete(retry.id);
          this.enqueueSpeech(retry);
        }
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('mousedown', unlock, { passive: true });
      window.addEventListener('click', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
  }

  /**
   * Builds a crisp 44.1kHz 16-bit mono WAV Data URI for the Elimination Sound Effect
   * (Sub-bass impact punch + 3-note stadium elimination synth chime) so it ALWAYS plays
   * reliably through HTML5 Audio just like the announcer voice!
   */
  private buildEliminationStingWavUri(): string {
    const sampleRate = 44100;
    const durationSec = 0.48;
    const numSamples = Math.floor(sampleRate * durationSec);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    let phaseSub = 0;
    let phase1 = 0;
    let phase2 = 0;

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;

      // 1. Deep punchy sub-bass impact drop (165Hz -> 42Hz over 0.28s)
      const subEnv = t < 0.28 ? Math.pow(1 - t / 0.28, 1.6) : 0;
      const subFreq = 42 + 123 * Math.exp(-t * 14);
      phaseSub += (2 * Math.PI * subFreq) / sampleRate;
      const subSig = Math.sin(phaseSub) * subEnv * 0.65;

      // 2. Distinct 3-note stadium elimination chime (G5 784Hz -> Eb5 622Hz -> G4 392Hz)
      let noteFreq = 783.99;
      let noteLocalT = t;
      let noteDur = 0.12;
      if (t >= 0.11 && t < 0.22) {
        noteFreq = 622.25;
        noteLocalT = t - 0.11;
        noteDur = 0.11;
      } else if (t >= 0.22) {
        noteFreq = 392.0;
        noteLocalT = t - 0.22;
        noteDur = 0.26;
      }

      const noteEnv =
        noteLocalT < noteDur
          ? Math.min(1, noteLocalT / 0.006) * Math.pow(1 - noteLocalT / noteDur, 1.35)
          : 0;
      phase1 += (2 * Math.PI * noteFreq) / sampleRate;
      phase2 += (2 * Math.PI * (noteFreq * 1.5)) / sampleRate;

      const chimeSig = (Math.sin(phase1) * 0.75 + Math.sin(phase2) * 0.25) * noteEnv * 0.55;
      const mixed = Math.max(-0.98, Math.min(0.98, subSig + chimeSig));
      view.setInt16(44 + i * 2, Math.round(mixed * 32767), true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  public getConfig(): AudioMixerConfig {
    return { ...this.config };
  }

  public updateConfig(partial: Partial<AudioMixerConfig>) {
    this.config = { ...this.config, ...partial };
    if (this.masterGain && this.ctx) {
      const target = this.config.muted ? 0 : this.config.masterVolume;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
    }
    if (this.ambienceGain && this.ctx) {
      this.ambienceGain.gain.setTargetAtTime(
        this.config.muted ? 0 : this.config.musicVolume * 0.14,
        this.ctx.currentTime,
        0.1
      );
    }
    this.notify();
  }

  public getDiagnostics(): CommentaryDiagnostics {
    return {
      ...this.diagnostics,
      pendingCount: this.speechQueue.length,
    };
  }

  public ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.config.muted ? 0 : this.config.masterVolume;
      this.masterGain.connect(this.ctx.destination);

      this.duckingGain = this.ctx.createGain();
      this.duckingGain.gain.value = 1.0;
      this.duckingGain.connect(this.masterGain);

      this.startStadiumAmbience();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private startStadiumAmbience() {
    if (!this.ctx || !this.duckingGain || this.ambienceOsc) return;
    try {
      const osc = this.ctx.createOscillator();
      const subOsc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = 55; // Deep A1 stadium drone
      subOsc.type = 'sine';
      subOsc.frequency.value = 110;

      filter.type = 'lowpass';
      filter.frequency.value = 140;

      gain.gain.value = this.config.muted ? 0 : this.config.musicVolume * 0.12;

      osc.connect(filter);
      subOsc.connect(filter);
      filter.connect(gain);
      gain.connect(this.duckingGain);

      osc.start();
      subOsc.start();
      this.ambienceOsc = osc;
      this.ambienceGain = gain;
    } catch {
      // Ignore if autoplay blocked until interaction
    }
  }

  private setDucking(active: boolean) {
    if (!this.ctx || !this.duckingGain) return;
    const target = active ? 0.28 : 1.0;
    this.duckingGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  public playTokenCollision(intensity: number) {
    if (this.config.muted || this.config.impactsVolume <= 0) return;
    const now = performance.now();
    if (now - this.lastCollisionSoundAt < 48) return; // Rate limit collision spam
    this.lastCollisionSoundAt = now;

    const ctx = this.ensureContext();
    if (!ctx || !this.duckingGain) return;

    const clamped = Math.max(0.1, Math.min(1, intensity));
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const pitchVariation = 0.92 + Math.random() * 0.16;
    const baseFreq = (240 + clamped * 260) * pitchVariation;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.045);

    const vol = clamped * 0.18 * this.config.impactsVolume;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(gain);
    gain.connect(this.duckingGain);
    osc.start(t);
    osc.stop(t + 0.055);
  }

  public playPerimeterContact(intensity: number) {
    if (this.config.muted || this.config.impactsVolume <= 0) return;
    const now = performance.now();
    if (now - this.lastPerimeterSoundAt < 65) return;
    this.lastPerimeterSoundAt = now;

    const ctx = this.ensureContext();
    if (!ctx || !this.duckingGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520 + Math.random() * 60, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.07);

    const vol = Math.min(1, intensity) * 0.16 * this.config.impactsVolume;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

    osc.connect(gain);
    gain.connect(this.duckingGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  public playDeflectorContact(intensity: number) {
    if (this.config.muted || this.config.impactsVolume <= 0) return;
    const now = performance.now();
    if (now - this.lastDeflectorSoundAt < 55) return;
    this.lastDeflectorSoundAt = now;

    const ctx = this.ensureContext();
    if (!ctx || !this.duckingGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(310 + Math.random() * 45, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.065);

    const vol = Math.min(1, intensity) * 0.2 * this.config.impactsVolume;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.connect(gain);
    gain.connect(this.duckingGain);
    osc.start(t);
    osc.stop(t + 0.075);
  }

  public playCountdownTick(secondsLeft: number) {
    if (this.config.muted || this.config.hazardVolume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.duckingGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Escalating pitch as opening approaches
    const urgency = Math.max(0, Math.min(1, (2.0 - secondsLeft) / 2.0));
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660 + urgency * 320, t);
    osc.frequency.exponentialRampToValueAtTime(440 + urgency * 220, t + 0.09);

    gain.gain.setValueAtTime(0.24 * this.config.hazardVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.095);

    osc.connect(gain);
    gain.connect(this.duckingGain);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  public playHatchOpen() {
    if (this.config.muted || this.config.hazardVolume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.duckingGain) return;

    const t = ctx.currentTime;

    // Layer 1: Crisp mechanical shutter / iris release click-chime
    const chimeOsc = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chimeOsc.type = 'triangle';
    chimeOsc.frequency.setValueAtTime(540, t);
    chimeOsc.frequency.exponentialRampToValueAtTime(880, t + 0.08);
    chimeOsc.frequency.exponentialRampToValueAtTime(320, t + 0.22);
    chimeGain.gain.setValueAtTime(0.28 * this.config.hazardVolume, t);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    chimeOsc.connect(chimeGain);
    chimeGain.connect(this.duckingGain);
    chimeOsc.start(t);
    chimeOsc.stop(t + 0.25);

    // Layer 2: Deep vortex chamber opening sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.3);

    gain.gain.setValueAtTime(0.36 * this.config.hazardVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    osc.connect(gain);
    gain.connect(this.duckingGain);
    osc.start(t);
    osc.stop(t + 0.34);
  }

  public playHatchClose() {
    if (this.config.muted || this.config.hazardVolume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.duckingGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(85, t);
    osc.frequency.exponentialRampToValueAtTime(210, t + 0.16);

    gain.gain.setValueAtTime(0.26 * this.config.hazardVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.duckingGain);
    osc.start(t);
    osc.stop(t + 0.19);
  }

  public playEliminationSting() {
    if (this.config.muted || this.config.hazardVolume <= 0) return;

    // 1. Play pre-rendered 44.1kHz PCM WAV Elimination Sting via HTML5 Audio (guaranteed audible!)
    if (this.eliminationWavUri) {
      try {
        const sfx = new Audio(this.eliminationWavUri);
        sfx.volume = Math.min(1, this.config.masterVolume * Math.max(0.75, this.config.hazardVolume));
        sfx.play().catch(() => {});
      } catch {
        // Ignore HTML5 audio errors
      }
    }

    // 2. Also layer Web Audio sub-bass punch + stadium synth chord when AudioContext is running
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || ctx.state !== 'running') return;

    const t = ctx.currentTime;
    // Sub-bass impact punch
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(160, t);
    subOsc.frequency.exponentialRampToValueAtTime(42, t + 0.26);
    subGain.gain.setValueAtTime(0.45 * this.config.hazardVolume, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(t);
    subOsc.stop(t + 0.3);

    // 3-note descending stadium elimination sting
    const freqs = [783.99, 622.25, 392.0];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t + idx * 0.075);
      osc.frequency.exponentialRampToValueAtTime(f * 0.92, t + idx * 0.075 + 0.22);

      gain.gain.setValueAtTime(0.36 * this.config.hazardVolume, t + idx * 0.075);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.075 + 0.24);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t + idx * 0.075);
      osc.stop(t + idx * 0.075 + 0.25);
    });
  }

  public playShieldBlock() {
    if (this.config.muted || this.config.alertsVolume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t + i * 0.045);
      gain.gain.setValueAtTime(0.25 * this.config.alertsVolume, t + i * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.045 + 0.22);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t + i * 0.045);
      osc.stop(t + i * 0.045 + 0.24);
    });
  }

  public playSubscriberAlert() {
    if (this.config.muted || this.config.alertsVolume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const notes = [587.33, 783.99, 987.77, 1174.66];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + i * 0.07);
      gain.gain.setValueAtTime(0.26 * this.config.alertsVolume, t + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.28);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.3);
    });
  }

  public playWinnerFanfare() {
    if (this.config.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const chord = [
      { freq: 523.25, delay: 0, dur: 0.25 },
      { freq: 659.25, delay: 0.16, dur: 0.25 },
      { freq: 783.99, delay: 0.32, dur: 0.25 },
      { freq: 1046.5, delay: 0.48, dur: 0.75 },
    ];
    for (const n of chord) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.freq, t + n.delay);
      gain.gain.setValueAtTime(0.32 * this.config.alertsVolume, t + n.delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.delay + n.dur);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + n.delay);
      osc.stop(t + n.delay + n.dur + 0.02);
    }
  }

  private fetchServerTtsAudio(text: string): Promise<{
    audioBase64?: string;
    mimeType?: string;
    provider?: string;
  } | null> {
    if (!this.config.preferServerTts || this.config.muted) {
      return Promise.resolve(null);
    }
    return fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceName: this.config.voiceName,
      }),
    })
      .then(async (resp) => {
        if (!resp.ok) {
          const errJson = await resp.json().catch(() => ({}));
          this.diagnostics.lastError = errJson.error || `Server TTS HTTP ${resp.status}`;
          return null;
        }
        return (await resp.json()) as {
          audioBase64?: string;
          mimeType?: string;
          provider?: string;
        };
      })
      .catch((err) => {
        this.diagnostics.lastError = err instanceof Error ? err.message : 'Server TTS unreachable';
        return null;
      });
  }

  /**
   * Clears any stale speech queue items from a finished match so the New Match
   * announcement plays in immediate sync with the start of the new match.
   */
  public clearSpeechQueueForNewMatch() {
    this.speechQueue = [];
    this.diagnostics.pendingCount = 0;
    this.notify();
  }

  /**
   * Enqueues spoken commentary with deduplication, immediate parallel TTS pre-fetching,
   * and priority ordering so every single game announcement and country elimination is spoken cleanly.
   */
  public enqueueSpeech(item: SpeechQueueItem) {
    if (this.processedSpeechIds.has(item.id)) return;
    this.processedSpeechIds.add(item.id);

    // Pre-fetch the neural TTS audio immediately in the background so it is ready with 0ms wait!
    if (!item.prefetchedTts) {
      item.prefetchedTts = this.fetchServerTtsAudio(item.text);
    }

    this.speechQueue.push(item);
    // Sort by priority: WINNER (0) > ELIMINATION (1) > COMMUNITY (2), preserving FIFO order within same priority
    const priorityRank = { WINNER: 0, ELIMINATION: 1, COMMUNITY: 2 };
    this.speechQueue.sort((a, b) => {
      const diff = priorityRank[a.priority] - priorityRank[b.priority];
      return diff !== 0 ? diff : a.createdAt - b.createdAt;
    });

    // Keep high capacity (32) so no country elimination or game announcement is dropped
    if (this.speechQueue.length > 32) {
      this.speechQueue = this.speechQueue.slice(0, 32);
    }

    this.diagnostics.pendingCount = this.speechQueue.length;
    this.notify();
    if (item.priority === 'ELIMINATION' && !this.isProcessingSpeech) {
      // Give the Elimination Sound Effect a crisp 180ms head-start while TTS finishes pre-fetching!
      setTimeout(() => void this.processNextSpeech(), 180);
    } else {
      void this.processNextSpeech();
    }
  }

  private async processNextSpeech() {
    if (this.isProcessingSpeech || this.speechQueue.length === 0) return;
    this.isProcessingSpeech = true;

    const next = this.speechQueue.shift()!;
    this.diagnostics.pendingCount = this.speechQueue.length;
    this.diagnostics.isSpeaking = true;
    this.diagnostics.activeText = next.text;
    this.setDucking(true);
    this.notify();

    let spokenSuccess = false;
    let usedProvider: CommentaryDiagnostics['lastProvider'] = 'NONE';
    const playbackRate = next.priority === 'ELIMINATION' ? 1.12 : 1.05;

    try {
      // 1. Use pre-fetched 100% Free Realistic Neural TTS (or Gemini TTS) audio from /api/tts
      if (this.config.preferServerTts && !this.config.muted) {
        try {
          const data = await (next.prefetchedTts || this.fetchServerTtsAudio(next.text));
          if (data?.audioBase64) {
            await this.playAudioBase64(data.audioBase64, data.mimeType || 'audio/mpeg', playbackRate);
            spokenSuccess = true;
            this.pendingAutoplayItem = null;
            usedProvider = data.provider?.startsWith('FREE_NEURAL')
              ? 'FREE_NEURAL_TTS'
              : 'GEMINI_TTS';
          }
        } catch (err) {
          this.pendingAutoplayItem = next;
          this.diagnostics.lastError = err instanceof Error ? err.message : 'Server TTS playback error';
        }
      }

      // 2. Use browser SpeechSynthesis API for instant low-latency spoken commentary
      if (!spokenSuccess && !this.config.muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        spokenSuccess = await this.speakViaWebSpeech(next.text);
        if (spokenSuccess) {
          this.pendingAutoplayItem = null;
          usedProvider = 'WEB_SPEECH_SYNTH';
        }
      }

      // 3. Guaranteed audible Web Audio vocal formant articulation fallback if headless/muted speechSynthesis stalls
      if (!spokenSuccess && !this.config.muted) {
        await this.playFormantAnnouncerCadence(next.text);
        spokenSuccess = true;
        usedProvider = 'WEB_AUDIO_FORMANT';
      }
    } catch (err) {
      this.diagnostics.errorCount += 1;
      this.diagnostics.lastError = err instanceof Error ? err.message : 'Speech error';
    }

    this.diagnostics.isSpeaking = false;
    this.diagnostics.activeText = null;
    this.diagnostics.completedCount += 1;
    this.diagnostics.lastProvider = usedProvider;
    this.diagnostics.recentHistory = [
      {
        id: next.id,
        text: next.text,
        provider: usedProvider,
        timestamp: Date.now(),
      },
      ...this.diagnostics.recentHistory.slice(0, 14),
    ];

    this.setDucking(false);
    this.isProcessingSpeech = false;
    this.notify();

    if (this.speechQueue.length > 0) {
      setTimeout(() => void this.processNextSpeech(), 55);
    }
  }

  private playAudioBase64ViaWebAudio(base64: string, playbackRate = 1.08): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ctx = this.ensureContext();
        if (!ctx || !this.masterGain) {
          reject(new Error('Web Audio context unavailable'));
          return;
        }
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        ctx
          .decodeAudioData(bytes.buffer.slice(0))
          .then((audioBuffer) => {
            const source = ctx.createBufferSource();
            const gain = ctx.createGain();
            source.buffer = audioBuffer;
            source.playbackRate.value = playbackRate;
            gain.gain.value = this.config.muted ? 0 : Math.min(1.2, this.config.commentaryVolume);
            source.connect(gain);
            gain.connect(this.masterGain!);
            const timer = setTimeout(() => {
              try {
                source.stop();
              } catch {
                // ignore
              }
              resolve();
            }, 6500);
            source.onended = () => {
              clearTimeout(timer);
              resolve();
            };
            source.start(0);
          })
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  private playAudioBase64(base64: string, mimeType = 'audio/mpeg', playbackRate = 1.08): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const audio = new Audio(`data:${mimeType};base64,${base64}`);
        audio.volume = this.config.muted ? 0 : Math.min(1, this.config.masterVolume * this.config.commentaryVolume);
        audio.defaultPlaybackRate = playbackRate;
        audio.playbackRate = playbackRate;
        const timer = setTimeout(() => {
          audio.pause();
          resolve();
        }, 6500);
        audio.onended = () => {
          clearTimeout(timer);
          resolve();
        };
        audio.onerror = () => {
          clearTimeout(timer);
          this.playAudioBase64ViaWebAudio(base64, playbackRate).then(resolve).catch(reject);
        };
        audio.play().catch(() => {
          clearTimeout(timer);
          this.playAudioBase64ViaWebAudio(base64, playbackRate).then(resolve).catch(reject);
        });
      } catch (e) {
        this.playAudioBase64ViaWebAudio(base64, playbackRate).then(resolve).catch(() => reject(e));
      }
    });
  }

  private speakViaWebSpeech(text: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const synth = window.speechSynthesis;
        if (!synth) {
          resolve(false);
          return;
        }
        try {
          synth.resume();
        } catch {
          // ignore
        }
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.05;
        utter.pitch = 1.22; // Clear female announcer pitch
        utter.volume = Math.min(1, this.config.masterVolume * this.config.commentaryVolume);

        const voices = synth.getVoices();
        const femaleKeywords = [
          'Google UK English Female',
          'Google US English',
          'Microsoft Aria',
          'Microsoft Jenny',
          'Microsoft Sonia',
          'Microsoft Zira',
          'Samantha',
          'Victoria',
          'Karen',
          'Moira',
          'Tessa',
          'Natasha',
          'Female',
          'Woman',
        ];

        let preferred = voices.find(
          (v) =>
            v.lang.toLowerCase().startsWith('en') &&
            femaleKeywords.some((kw) => v.name.toLowerCase().includes(kw.toLowerCase()))
        );
        if (!preferred) {
          preferred = voices.find(
            (v) =>
              v.lang.toLowerCase().startsWith('en') &&
              !v.name.toLowerCase().includes('male') &&
              !v.name.toLowerCase().includes('david') &&
              !v.name.toLowerCase().includes('mark') &&
              !v.name.toLowerCase().includes('daniel') &&
              !v.name.toLowerCase().includes('alex') &&
              !v.name.toLowerCase().includes('james')
          );
        }
        if (!preferred) {
          preferred = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
        }
        if (preferred) utter.voice = preferred;

        let settled = false;
        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };

        // Timeout guard in case headless browser has no OS TTS voices installed
        const timeout = setTimeout(() => {
          synth.cancel();
          finish(false);
        }, 3800);

        utter.onend = () => {
          clearTimeout(timeout);
          finish(true);
        };
        utter.onerror = () => {
          clearTimeout(timeout);
          finish(false);
        };

        synth.speak(utter);
      } catch {
        resolve(false);
      }
    });
  }

  private playFormantAnnouncerCadence(text: string): Promise<void> {
    return new Promise((resolve) => {
      const ctx = this.ensureContext();
      if (!ctx || !this.masterGain) {
        setTimeout(resolve, 600);
        return;
      }

      const words = text.split(/\s+/).slice(0, 12);
      const t0 = ctx.currentTime;
      const step = 0.095;

      words.forEach((w, idx) => {
        const osc = ctx.createOscillator();
        const formant = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        const isCaps = w === w.toUpperCase() && w.length > 2;
        const basePitch = isCaps ? 265 : 228; // Female fundamental pitch range
        const charHash = w.charCodeAt(0) || 65;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(basePitch + (charHash % 38), t0 + idx * step);

        formant.type = 'bandpass';
        formant.frequency.setValueAtTime(1120 + (charHash % 420), t0 + idx * step);
        formant.Q.value = 3.2;

        const vol = 0.14 * this.config.commentaryVolume;
        gain.gain.setValueAtTime(vol, t0 + idx * step);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + idx * step + step * 0.85);

        osc.connect(formant);
        formant.connect(gain);
        gain.connect(this.masterGain!);

        osc.start(t0 + idx * step);
        osc.stop(t0 + idx * step + step * 0.9);
      });

      setTimeout(resolve, Math.min(1600, words.length * 95 + 150));
    });
  }
}

export const soundEngine = new ArenaSoundEngine();
