const BGM_SRC = "./assets/bgm.mp3?v=1";
const BGM_VOL = 0.4;
const BGM_MUTE_KEY = "catbox-bgm-mute";

const bgm = new Audio(BGM_SRC);
bgm.loop = true;
bgm.preload = "auto";
bgm.volume = BGM_VOL;
bgm.playsInline = true;
bgm.setAttribute("playsinline", "");
bgm.setAttribute("webkit-playsinline", "");

let bgmUnlocked = false;
let bgmCtx = null;

function bgmMuted() {
  return localStorage.getItem(BGM_MUTE_KEY) === "1";
}

function resumeBgmCtx() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!bgmCtx) bgmCtx = new AC();
    if (bgmCtx.state === "suspended") bgmCtx.resume();
  } catch (_) {}
}

function playBgm() {
  if (bgmMuted() || document.visibilityState !== "visible") return;
  bgm.muted = false;
  bgm.volume = BGM_VOL;
  const p = bgm.play();
  if (p && p.catch) p.catch(() => {});
}

function unlockBgm() {
  resumeBgmCtx();
  bgmUnlocked = true;
  if (!bgmMuted()) playBgm();
}

function setBgmMuted(on) {
  localStorage.setItem(BGM_MUTE_KEY, on ? "1" : "0");
  bgm.muted = on;
  if (on) bgm.pause();
  else if (bgmUnlocked && document.visibilityState === "visible") playBgm();
  syncBgmUi();
}

function syncBgmUi() {
  const btn = document.getElementById("bgmBtn");
  if (!btn) return;
  const muted = bgmMuted();
  btn.classList.toggle("muted", muted);
  btn.setAttribute("aria-pressed", muted ? "true" : "false");
  const label = typeof t === "function" ? t(muted ? "bgmUnmute" : "bgm") : muted ? "Unmute" : "Music";
  btn.setAttribute("aria-label", label);
  btn.title = label;
}

window.syncBgmUi = syncBgmUi;

function bootBgm() {
  bgm.muted = bgmMuted();
  syncBgmUi();
  const btn = document.getElementById("bgmBtn");
  if (btn) {
    btn.addEventListener("pointerdown", (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      resumeBgmCtx();
      bgmUnlocked = true;
      setBgmMuted(!bgmMuted());
    });
  }
  const gesture = (e) => {
    if (e.target && e.target.closest && e.target.closest("#bgmBtn")) return;
    unlockBgm();
  };
  document.addEventListener("pointerdown", gesture, { capture: true });
  document.addEventListener("touchstart", gesture, { capture: true, passive: true });
  document.addEventListener("click", gesture, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      bgm.pause();
      return;
    }
    if (bgmUnlocked && !bgmMuted()) playBgm();
  });
  playBgm();
}

bootBgm();
