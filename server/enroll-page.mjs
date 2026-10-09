export function enrollPageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Enroll authenticator — Playadda</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Fraunces:opsz,wght@9..144,500&display=swap" rel="stylesheet">
  <style>
    :root { --bg:#07080c; --card:#161a24; --line:#2a2e38; --text:#e8eceb; --muted:#8b9390; --accent:#9fd8d0; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); font-family: "DM Sans", "Segoe UI", system-ui, sans-serif; }
    main { max-width: 720px; margin: 0 auto; padding: 28px 16px 64px; }
    .kicker { letter-spacing: .22em; text-transform: uppercase; font-size: 12px; color: var(--accent); margin: 0 0 10px; }
    h1 { font-family: Fraunces, Georgia, serif; font-weight: 500; font-size: clamp(28px, 5vw, 40px); margin: 0 0 8px; }
    p { color: var(--muted); line-height: 1.5; }
    form, .panel, .user { background: color-mix(in srgb, var(--card) 88%, transparent); border: 1px solid var(--line); border-radius: 20px; padding: 18px; }
    label { display: block; margin: 12px 0 6px; }
    input { width: 100%; min-height: 44px; border-radius: 12px; border: 1px solid var(--line); background: #07080c; color: var(--text); padding: 0 12px; font: inherit; }
    button, .linkish { min-height: 44px; border-radius: 999px; border: 0; background: var(--accent); color: #07080c; font: inherit; font-weight: 650; padding: 0 16px; }
    button.ghost { background: #1a1d24; color: var(--text); border: 1px solid var(--line); }
    .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 14px; }
    .error { color: #ffb4b4; min-height: 1.2em; }
    .ok { color: var(--accent); }
    #setup[hidden], #success[hidden] { display: none; }
    #qr { background: #fff; border-radius: 16px; padding: 12px; width: min(260px, 100%); }
    #qr svg { display: block; width: 100%; height: auto; }
    a.otpauth { color: var(--accent); font-weight: 650; }
    .key { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .04em; }
    ul { list-style: none; padding: 0; margin: 18px 0 0; display: grid; gap: 10px; }
    .user { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    .user span { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main>
    <p class="kicker">Playadda admin</p>
    <h1>Enroll an authenticator</h1>
    <p>The QR code, setup link, and key are shown once. After you confirm the 6-digit code, or if you reload, they are not shown again.</p>
    <form id="start">
      <label for="enroll-name">Display name</label>
      <input id="enroll-name" data-testid="enroll-name" name="name" autocomplete="off" required>
      <div class="row"><button type="submit" data-testid="enroll-create">Create setup</button></div>
    </form>
    <p id="error" class="error" data-testid="enroll-error" role="alert"></p>
    <section id="setup" data-testid="enroll-setup" hidden>
      <div id="qr" data-testid="enroll-qr"></div>
      <p><a class="otpauth" id="otpauth" data-testid="enroll-otpauth" href="#">Add to authenticator</a></p>
      <label for="enroll-secret">Setup key</label>
      <input id="enroll-secret" class="key" data-testid="enroll-secret" readonly>
      <div class="row">
        <button type="button" class="ghost" id="copy" data-testid="enroll-copy">Copy setup key</button>
      </div>
      <form id="confirm">
        <label for="enroll-code">First authenticator code</label>
        <input id="enroll-code" data-testid="enroll-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required>
        <div class="row"><button type="submit" data-testid="enroll-confirm">Confirm code</button></div>
      </form>
    </section>
    <p id="success" class="ok" data-testid="enroll-success" hidden></p>
    <h2>Enrolled users</h2>
    <ul id="users" data-testid="enroll-users"></ul>
  </main>
  <script>
    const error = document.getElementById("error");
    const setup = document.getElementById("setup");
    const success = document.getElementById("success");
    const users = document.getElementById("users");
    function setError(text) { error.textContent = text || ""; }
    async function api(path, options) {
      const res = await fetch(path, { credentials: "same-origin", ...options });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Request failed");
      return body;
    }
    function hideSetup() {
      setup.hidden = true;
      document.getElementById("qr").replaceChildren();
      const link = document.getElementById("otpauth");
      link.removeAttribute("href");
      link.textContent = "Add to authenticator";
      document.getElementById("enroll-secret").value = "";
      document.getElementById("enroll-code").value = "";
    }
    function renderUsers(list) {
      users.replaceChildren();
      for (const user of list || []) {
        const li = document.createElement("li");
        li.className = "user";
        li.dataset.testid = "enroll-user";
        const name = document.createElement("span");
        name.dataset.testid = "enroll-user-name";
        name.textContent = user.name;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ghost";
        button.dataset.testid = "enroll-remove";
        button.textContent = "Remove";
        button.addEventListener("click", async () => {
          setError("");
          try {
            await api("/api/admin/users/remove", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: user.name }),
            });
            await refresh();
          } catch (err) { setError(err.message); }
        });
        li.append(name, button);
        users.append(li);
      }
    }
    async function refresh() {
      const body = await api("/api/admin/users");
      renderUsers(body.users);
    }
    document.getElementById("start").addEventListener("submit", async (event) => {
      event.preventDefault();
      setError("");
      success.hidden = true;
      hideSetup();
      try {
        const body = await api("/api/admin/enroll", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: document.getElementById("enroll-name").value }),
        });
        document.getElementById("qr").innerHTML = body.qrSvg;
        const link = document.getElementById("otpauth");
        link.href = body.otpauth;
        link.textContent = "Add to authenticator";
        document.getElementById("enroll-secret").value = body.secret;
        setup.hidden = false;
      } catch (err) { setError(err.message); }
    });
    document.getElementById("copy").addEventListener("click", async () => {
      const value = document.getElementById("enroll-secret").value;
      document.getElementById("enroll-secret").select();
      try { await navigator.clipboard.writeText(value); } catch { /* the field stays selected */ }
    });
    document.getElementById("confirm").addEventListener("submit", async (event) => {
      event.preventDefault();
      setError("");
      const name = document.getElementById("enroll-name").value;
      const code = document.getElementById("enroll-code").value;
      try {
        const body = await api("/api/admin/enroll/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, code }),
        });
        hideSetup();
        success.hidden = false;
        success.textContent = body.name + " is enrolled. The setup key is no longer available.";
        document.getElementById("enroll-name").value = "";
        await refresh();
      } catch (err) { setError(err.message); }
    });
    refresh().catch((err) => setError(err.message));
  </script>
</body>
</html>`;
}
