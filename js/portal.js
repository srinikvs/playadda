(function () {
  const VERSION = "1.1.0";
  const canvas = document.getElementById("ambient");
  const flock = window.startMurmur(canvas);

  const menuBtn = document.getElementById("menu-btn");
  const drawer = document.getElementById("murmur-drawer");
  const scrim = document.getElementById("scrim");
  const play = document.getElementById("play");
  const frame = play.querySelector("iframe");
  const back = document.getElementById("back");

  function setMenu(open) {
    drawer.hidden = !open;
    scrim.hidden = !open;
    drawer.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    menuBtn.setAttribute("aria-label", open ? "Close Murmur controls" : "Open Murmur controls");
    menuBtn.innerHTML = open
      ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
      : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>';
  }

  menuBtn.addEventListener("click", () => setMenu(drawer.hidden));
  scrim.addEventListener("click", () => setMenu(false));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!play.hidden) closePlay();
      else setMenu(false);
    }
  });

  function closePlay() {
    play.classList.remove("open");
    play.hidden = true;
    frame.src = "about:blank";
    history.pushState({}, "", "/");
    if (flock) flock.paused = document.getElementById("pause")?.textContent === "Resume";
  }

  function openPlay(url) {
    setMenu(false);
    if (flock) flock.paused = true;
    frame.src = url;
    play.hidden = false;
    play.classList.add("open");
    history.pushState({ game: url }, "", url);
  }

  document.querySelectorAll("a.card").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      openPlay(card.getAttribute("data-game"));
    });
  });
  back.addEventListener("click", (e) => {
    e.preventDefault();
    closePlay();
  });
  window.addEventListener("popstate", () => {
    if (location.pathname === "/" || location.pathname === "") closePlay();
  });

  document.querySelectorAll("[data-version]").forEach((el) => {
    el.textContent = el.textContent.replace("__VERSION__", VERSION);
  });
})();
