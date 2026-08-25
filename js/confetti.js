// Kleine, lokal gebundelte Belohnungsanimation beim Abhaken einer Aufgabe.
var LFT = window.LFT || {};

(function () {
  "use strict";

  var COLORS = ["#4F9DDE", "#FF8A80", "#81D4AC", "#FFD166", "#B48EF0", "#5FD3C4"];
  var PRAISE = ["Super gemacht! 🎉", "Klasse! ⭐️", "Weiter so! 🙌", "Toll! 🚀", "Stark! 💪", "Yes!! 🥳"];

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function burst(originEl) {
    var root = document.getElementById("confetti-root");
    if (!root || !originEl) return;

    var rect = originEl.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;

    var count = 22;
    for (var i = 0; i < count; i++) {
      var piece = document.createElement("div");
      piece.className = "confetti-piece";
      var angle = randomBetween(0, Math.PI * 2);
      var distance = randomBetween(40, 110);
      var x1 = Math.cos(angle) * distance;
      var y1 = Math.sin(angle) * distance - randomBetween(10, 40);
      var rot = randomBetween(-360, 360);
      var color = COLORS[Math.floor(Math.random() * COLORS.length)];
      var size = randomBetween(6, 10);

      piece.style.left = cx + "px";
      piece.style.top = cy + "px";
      piece.style.width = size + "px";
      piece.style.height = size + "px";
      piece.style.background = color;
      piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
      piece.style.setProperty("--x0", "0px");
      piece.style.setProperty("--y0", "0px");
      piece.style.setProperty("--x1", x1 + "px");
      piece.style.setProperty("--y1", (y1 + 130) + "px");
      piece.style.setProperty("--rot", rot + "deg");
      piece.style.animationDelay = randomBetween(0, 60) + "ms";

      root.appendChild(piece);
      (function (el) {
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 1100);
      })(piece);
    }

    var label = document.createElement("div");
    label.className = "praise-label";
    label.textContent = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    label.style.left = cx + "px";
    label.style.top = (cy - 10) + "px";
    root.appendChild(label);
    setTimeout(function () {
      if (label.parentNode) label.parentNode.removeChild(label);
    }, 950);

    playChime();
  }

  var audioCtx = null;

  function getAudioCtx() {
    if (audioCtx) return audioCtx;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  }

  function playChime() {
    var ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended" && ctx.resume) {
      ctx.resume();
    }
    var now = ctx.currentTime;
    var notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach(function (freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      var start = now + i * 0.08;
      var end = start + 0.22;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
  }

  LFT.confetti = {
    burst: burst,
    playChime: playChime
  };

  window.LFT = LFT;
})();
