// Injected into every page before the app's own code (Playwright addInitScript).
// 1. A controllable fake microphone: getUserMedia({audio}) returns a stream the recorder feeds clip by
//    clip (window.__demoMic.sayB64), so the voice agent hears the inventor exactly when the script says,
//    and hears silence otherwise (no looping file barging in over the agent).
// 2. Playback log: every real audio playback (Web Audio buffer, <audio>.play) is reported with its
//    length, so the recorder can place the agent's captured voice on the video timeline.
// 3. Browser-voice fallback alarm: the app falls back to speechSynthesis when Sarvam fails. That voice
//    cannot be captured, so the take is marked bad instead of silently losing the agent's audio.
(() => {
  const report = (type, data = {}) => {
    try {
      window.__demoEvent && window.__demoEvent(JSON.stringify({ type, ...data }));
    } catch (_) {}
  };

  let micCtx = null;
  let micDest = null;
  const micNodes = () => {
    if (!micCtx) {
      micCtx = new AudioContext();
      micDest = micCtx.createMediaStreamDestination();
    }
    return { ctx: micCtx, dest: micDest };
  };

  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const original = md.getUserMedia.bind(md);
    md.getUserMedia = async (constraints) => {
      if (constraints && constraints.audio && !constraints.video) {
        const { ctx, dest } = micNodes();
        if (ctx.state === "suspended") await ctx.resume();
        report("mic-open");
        // Each consumer (dictation recorder, barge-in detector) gets its own clone of the same feed.
        return new MediaStream(dest.stream.getAudioTracks().map((t) => t.clone()));
      }
      return original(constraints);
    };
  }

  window.__demoMic = {
    async sayB64(b64) {
      const { ctx, dest } = micNodes();
      if (ctx.state === "suspended") await ctx.resume();
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buffer = await ctx.decodeAudioData(bytes.buffer);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(dest);
      report("mic-say", { secs: buffer.duration });
      src.start();
      return buffer.duration;
    },
  };

  const startBuffer = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    // Ignore the fake mic and the app's tiny "unlock" buffers.
    if (this.context !== micCtx && this.buffer && this.buffer.duration > 0.3) report("play", { kind: "buffer", secs: this.buffer.duration });
    return startBuffer.apply(this, args);
  };

  const playMedia = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const src = String(this.currentSrc || this.src || "");
    if (src.startsWith("data:audio") || this instanceof HTMLAudioElement) report("play", { kind: "media", secs: Number.isFinite(this.duration) ? this.duration : null });
    return playMedia.call(this);
  };

  if (window.speechSynthesis) {
    const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u) => {
      // The app speaks a blank, silent utterance on every tap to unlock audio on iOS; only real speech counts.
      const text = String((u && u.text) || "").trim();
      if (text && !(u && u.volume === 0)) report("browser-voice-fallback", { text: text.slice(0, 120) });
      return speak(u);
    };
  }
})();
