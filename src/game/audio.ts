/**
 * HEIST audio — synthesised, not sampled.
 *
 * Every sound here is generated from oscillators and filtered noise at runtime,
 * so the build ships zero audio assets and there is no licence question: the
 * facility hum, the gunshot, the vault alarm and the extraction sting are all
 * authored in code (see §45 — original audio only).
 *
 * Rules this module follows:
 *   - nothing plays before a real user gesture (browser autoplay policy)
 *   - the interface is event-shaped, so the renderer describes *what happened*
 *     and never schedules raw frequencies
 *   - the master bus is quiet by default and every voice cleans itself up
 */

export type StepKind = "walk" | "sprint" | "sneak";

const MASTER_GAIN = 0.5;

export class HeistAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ambience: { stop: () => void } | null = null;
  private muted = false;
  private stepAt = 0;

  get ready() {
    return this.ctx !== null;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  resume() {
    if (this.muted) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(this.ctx);
    }
    void this.ctx.resume();
  }

  setMuted(next: boolean) {
    this.muted = next;
    if (next) {
      this.ambience?.stop();
      this.ambience = null;
      if (this.ctx) void this.ctx.suspend();
    } else {
      this.resume();
      if (this.ctx) void this.ctx.resume();
    }
  }

  dispose() {
    this.ambience?.stop();
    this.ambience = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx) void ctx.close().catch(() => {});
  }

  /* ------------------------------------------------------------- ambience --- */

  /** The room tone: a detuned low drone plus a slow filtered air movement. */
  startAmbience() {
    if (!this.ctx || !this.master || !this.noise || this.ambience || this.muted) return;
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);
    bus.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 2.5);

    const voices: { stop: () => void }[] = [];
    for (const [freq, detune] of [[55, -7], [55, 9]] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 190;
      lp.Q.value = 0.7;
      osc.connect(lp).connect(bus);
      osc.start();
      voices.push({ stop: () => { try { osc.stop(); } catch { /* already stopped */ } } });
    }

    // Air: filtered noise, with an LFO on the cutoff so the room breathes.
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    const airLp = ctx.createBiquadFilter();
    airLp.type = "bandpass";
    airLp.frequency.value = 420;
    airLp.Q.value = 0.6;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.09;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 180;
    lfo.connect(lfoDepth).connect(airLp.frequency);
    air.connect(airLp).connect(airGain).connect(bus);
    air.start();
    lfo.start();
    voices.push({
      stop: () => {
        try { air.stop(); lfo.stop(); } catch { /* already stopped */ }
      },
    });

    this.ambience = {
      stop: () => {
        const now = ctx.currentTime;
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.linearRampToValueAtTime(0, now + 0.4);
        for (const v of voices) window.setTimeout(v.stop, 500);
        window.setTimeout(() => bus.disconnect(), 600);
      },
    };
  }

  /* ----------------------------------------------------------------- noise --- */

  private makeNoise(ctx: AudioContext) {
    const frames = Math.floor(ctx.sampleRate * 1.5);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private burst(gain: number, duration: number, filter: { type: BiquadFilterType; freq: number; q?: number }) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1;
    const bq = ctx.createBiquadFilter();
    bq.type = filter.type;
    bq.frequency.value = filter.freq;
    bq.Q.value = filter.q ?? 1;
    const env = ctx.createGain();
    const now = ctx.currentTime;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(bq).connect(env).connect(this.master);
    src.start(now, Math.random());
    src.stop(now + duration + 0.02);
  }

  private tone(
    freq: number,
    duration: number,
    opts: { type?: OscillatorType; gain?: number; to?: number; delay?: number } = {},
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(freq, now);
    if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), now + duration);
    const env = ctx.createGain();
    const peak = opts.gain ?? 0.18;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + Math.min(0.01, duration / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(env).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /* ----------------------------------------------------------- game events --- */

  /** Footsteps, walked by the caller so the cadence follows actual speed. */
  step(kind: StepKind, moving: boolean) {
    if (!this.ctx || this.muted || !moving) return;
    const now = performance.now();
    const interval = kind === "sprint" ? 260 : kind === "sneak" ? 620 : 400;
    if (now - this.stepAt < interval) return;
    this.stepAt = now;
    const gain = kind === "sneak" ? 0.05 : kind === "sprint" ? 0.15 : 0.1;
    this.burst(gain, kind === "sprint" ? 0.1 : 0.08, {
      type: "lowpass",
      freq: kind === "sprint" ? 1900 : kind === "sneak" ? 620 : 1200,
    });
  }

  /** `near` is the player's own gun; anything else reads as a distant crack. */
  shot(near: boolean) {
    if (near) {
      this.burst(0.5, 0.14, { type: "highpass", freq: 700 });
      this.tone(180, 0.1, { type: "square", gain: 0.22, to: 60 });
    } else {
      this.burst(0.16, 0.13, { type: "lowpass", freq: 700 });
      this.tone(120, 0.09, { type: "square", gain: 0.09, to: 50 });
    }
  }

  melee() {
    this.burst(0.3, 0.12, { type: "bandpass", freq: 1500, q: 1.4 });
  }

  dash() {
    this.burst(0.22, 0.22, { type: "lowpass", freq: 2600 });
    this.tone(420, 0.2, { type: "triangle", gain: 0.12, to: 140 });
  }

  emp() {
    this.tone(520, 0.45, { type: "sawtooth", gain: 0.2, to: 48 });
    this.burst(0.3, 0.4, { type: "lowpass", freq: 1800 });
  }

  scanner() {
    this.tone(1250, 0.1, { type: "sine", gain: 0.16 });
    this.tone(1850, 0.14, { type: "sine", gain: 0.12, delay: 0.11 });
  }

  hackTick() {
    this.tone(880, 0.05, { type: "square", gain: 0.07 });
  }

  /** Alert-class events: an alarm rather than a chime. */
  alarm() {
    for (let i = 0; i < 3; i++) {
      this.tone(880, 0.16, { type: "triangle", gain: 0.13, delay: i * 0.26 });
      this.tone(660, 0.16, { type: "triangle", gain: 0.13, delay: i * 0.26 + 0.13 });
    }
  }

  /** The Core moving is the loudest thing that can happen short of the alarm. */
  coreTaken() {
    this.tone(320, 0.18, { type: "square", gain: 0.16 });
    this.tone(480, 0.18, { type: "square", gain: 0.16, delay: 0.11 });
    this.tone(720, 0.3, { type: "square", gain: 0.18, delay: 0.22 });
  }

  lockdown() {
    this.tone(300, 0.9, { type: "sawtooth", gain: 0.2, to: 70 });
    this.burst(0.35, 0.5, { type: "lowpass", freq: 900 });
    this.tone(70, 0.5, { type: "sine", gain: 0.3, delay: 0.5 });
  }

  extractTick(remaining: number) {
    this.tone(remaining <= 1 ? 1400 : 1000, 0.09, { type: "sine", gain: 0.14 });
  }

  sting(win: boolean) {
    const notes = win ? [392, 523, 659, 784] : [392, 349, 262];
    notes.forEach((f, i) => this.tone(f, win ? 0.5 : 0.7, { type: "triangle", gain: 0.16, delay: i * 0.13 }));
  }
}
