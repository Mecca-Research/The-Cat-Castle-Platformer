/** Small synthesised sounds; nothing to download. */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private wind: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null =
    null;

  unlock() {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  close() {
    void this.ctx?.close();
    this.ctx = null;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    at = 0,
    slide?: number,
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, freq: number, q: number, gain: number, sweep?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  jump(speed: number) {
    this.hiss(0.12, 900 + speed * 60, 1.2, 0.08, 2400);
    this.tone(260 + speed * 10, 0.1, "sine", 0.05, 0, 520);
  }

  land(impact: number) {
    const k = Math.min(1, impact / 12);
    this.tone(140, 0.09 + k * 0.05, "sine", 0.05 + k * 0.08, 0, 60);
    this.hiss(0.09, 500, 0.8, 0.03 + k * 0.05);
    if (impact > 6) this.bell(0.025 * k + 0.01);
  }

  bell(gain = 0.03) {
    this.tone(2350, 0.32, "sine", gain);
    this.tone(3530, 0.22, "sine", gain * 0.6, 0.004);
    this.tone(4710, 0.12, "sine", gain * 0.3, 0.008);
  }

  skid() {
    this.hiss(0.14, 2600, 2, 0.035, 1500);
  }

  drop() {
    this.hiss(0.1, 700, 1, 0.04, 300);
  }

  /** A soft bite. */
  nom() {
    this.tone(220 + Math.random() * 40, 0.06, "sine", 0.05, 0, 140);
    this.hiss(0.05, 1800, 2, 0.025);
  }

  /** A low, contented rumble. */
  purr() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 26;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.3);
    g.gain.setValueAtTime(0.05, t + 1.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(f);
    f.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 2.3);
  }

  win() {
    const notes = [784, 988, 1175, 1568];
    notes.forEach((n, i) => {
      this.tone(n, 0.5, "triangle", 0.06, i * 0.09);
      this.tone(n * 2, 0.3, "sine", 0.02, i * 0.09 + 0.01);
    });
    this.bell(0.05);
    // A pleased little "mrrp".
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + 0.45;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(420, t);
    o.frequency.linearRampToValueAtTime(640, t + 0.12);
    o.frequency.linearRampToValueAtTime(560, t + 0.26);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 28;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 22;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 1100;
    f1.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(f1);
    f1.connect(g);
    g.connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.32);
    lfo.stop(t + 0.32);
  }
}
