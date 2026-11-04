/*
 * Skrip pelacak website first-party — Phase 4, item 1.
 *
 * Dipasang di situs pemasang, bukan di aplikasi ini. Cara pakai:
 *
 *   <script defer src="https://<worker>/track.js" data-track-key="<TRACK_KEY>"></script>
 *
 * Endpoint penerima ditebak dari `src` skrip ini: `https://<worker>/api/track`.
 * Karena skrip dimuat dari domain situs pemasang, URL relatif (`/api/track`)
 * akan menunjuk ke domain pemasang — bukan ke Worker — sehingga peristiwa
 * terkirim ke tempat yang salah. `data-endpoint` hanya perlu diisi bila
 * penerima berada di alamat lain; nilai relatifnya diselesaikan terhadap `src`.
 *   <script>
 *     // Opsional, dipanggil saat pengunjung melihat produk atau menyelesaikan pesanan:
 *     peakalpha.track("product_view", { path: "/produk/kemeja-flanel" });
 *     peakalpha.track("order", { path: "/terima-kasih", value: 249000, currency: "IDR" });
 *   </script>
 *
 * Batas yang disengaja dan perlu diketahui pembaca skrip ini:
 *
 * - `data-track-key` memang dapat dibaca siapa pun yang membuka halaman. Kunci
 *   ini bukan rahasia; ia hanya menghalangi pengiriman liar dari luar.
 * - Tidak ada cookie. `session_id` hanya disimpan di `sessionStorage` dan hilang
 *   saat tab ditutup. Tidak ada identitas pengunjung lintas sesi yang dibangun,
 *   sehingga atribusi yang mungkin hanyalah atribusi UTM, bukan multi-sentuh.
 * - Tidak ada pelacakan ke halaman lain, tidak ada penjualan data. Yang dikirim
 *   hanya yang tampak di blok `payload` di bawah.
 * - Bila kunci belum diisi, skrip berhenti tanpa mengirim apa pun alih-alih
 *   mengirim peristiwa yang pasti ditolak server.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var trackKey = script.getAttribute("data-track-key");
  if (!trackKey) return;

  /* Selesaikan alamat penerima terhadap `src` skrip (domain Worker), bukan
     terhadap halaman pemasang. Tanpa ini, "/api/track" jatuh ke domain situs
     pemasang dan semua peristiwa hilang. */
  function resolveEndpoint() {
    var configured = script.getAttribute("data-endpoint") || "/api/track";
    var base = script.src || window.location.href;
    try {
      return new URL(configured, base).toString();
    } catch {
      return configured;
    }
  }
  var endpoint = resolveEndpoint();

  var UTM_KEYS = ["source", "medium", "campaign", "content", "term"];
  var UTM_PARAM = {
    source: "utm_source",
    medium: "utm_medium",
    campaign: "utm_campaign",
    content: "utm_content",
    term: "utm_term",
  };

  /* Satu id acak per peristiwa: inilah kunci idempotensi yang membuat
     pengiriman ulang tidak menambah baris kedua di server. */
  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "evt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  function sessionId() {
    try {
      var existing = window.sessionStorage.getItem("peakalpha_session");
      if (existing) return existing;
      var created = randomId();
      window.sessionStorage.setItem("peakalpha_session", created);
      return created;
    } catch {
      // Session storage dapat diblokir; peristiwa tetap dikirim tanpa sesi
      // alih-alih tidak dikirim sama sekali.
      return null;
    }
  }

  function utmFromLocation() {
    var utm = {};
    var params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return utm;
    }
    for (var index = 0; index < UTM_KEYS.length; index += 1) {
      var key = UTM_KEYS[index];
      var value = params.get(UTM_PARAM[key]);
      if (value) utm[key] = value;
    }
    return utm;
  }

  function send(events) {
    // `keepalive` membuat permintaan tetap terkirim ketika halaman berpindah
    // atau ditutup. `sendBeacon` tidak dipakai karena tidak dapat mengirim
    // header kunci, dan menaruh kunci di query string akan membuatnya tercatat
    // di log akses server — dengan header, hal itu tidak terjadi.
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-track-key": trackKey },
      body: JSON.stringify({ events: events }),
      keepalive: true,
      mode: "cors",
    }).catch(function () {
      // Kegagalan pengiriman sengaja tidak mengganggu situs pemasang.
    });
  }

  function track(type, options) {
    var opts = options || {};
    send([
      {
        id: randomId(),
        type: type,
        path: opts.path || window.location.pathname,
        occurredAt: new Date().toISOString(),
        referrer: opts.referrer === undefined ? document.referrer || null : opts.referrer,
        sessionId: sessionId(),
        utm: opts.utm || utmFromLocation(),
        value: opts.value === undefined ? null : opts.value,
        currency: opts.currency === undefined ? null : opts.currency,
      },
    ]);
  }

  window.peakalpha = { track: track };

  track("pageview");
})();
