/* =====================================================================
 *  MASARU TELEMETRY — Universal Tracker  (masaru-track.js)
 *  ส่ง log การใช้งานเข้า "Hub กลาง" ของคุณ (คนละ Supabase กับระบบงาน)
 *
 *  ใช้กับระบบไหนก็ได้ — ไม่ต้องมี supabase-js ในหน้านั้น
 *  วิธีใช้: ก่อน </body> ใส่ 2 บรรทัด (แก้ค่า 3 ตัว)
 *
 *    <script>
 *      window.MASARU_TRACK = {
 *        hub:    'https://<HUB-PROJECT>.supabase.co',  // URL โปรเจกต์ hub
 *        anon:   'sb_publishable_xxx',                 // anon key ของ hub
 *        system: 'acc',                                // code ของระบบนี้
 *        key:    'wk_acc_xxxxxxxx'                     // write_key ของระบบนี้
 *      };
 *    </script>
 *    <script src="masaru-track.js"></script>
 *
 *  ระบุตัวผู้ใช้ (เลือกอย่างใดอย่างหนึ่ง):
 *    - ถ้ามี Supabase auth อยู่แล้ว → จับ email/role ให้อัตโนมัติ
 *    - หรือ set เอง:  MasaruTrack.identify({ email, name, role })
 *
 *  บันทึก action:  MasaruTrack.event('export_pdf', { doc:'receipt' })
 *  หรือติดป้ายปุ่ม: <button data-track="ออก PDF">...</button>
 * ===================================================================== */
(function () {
  'use strict';
  var C = window.MASARU_TRACK || {};
  if (!C.hub || !C.anon || !C.system || !C.key) { return; } // ยังไม่ตั้งค่า

  var ENDPOINT = C.hub.replace(/\/+$/, '') + '/rest/v1/rpc/track';
  var HEARTBEAT_MS = 60000;

  var app = (location.pathname.split('/').pop() || 'index.html').split('?')[0] || 'index.html';
  var sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var user = { email: null, name: null, role: null };
  var beat = null, started = false;

  function device() {
    var w = window.innerWidth || 1024;
    if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) return 'mobile';
    if (w <= 1024) return 'tablet';
    return 'desktop';
  }

  function post(event, detail, keepalive) {
    var body = {
      p_key: C.key, p_system: C.system, p_app: app, p_event: event,
      p_email: user.email, p_name: user.name, p_role: user.role,
      p_session: sessionId, p_detail: detail || null,
      p_path: location.pathname, p_ua: navigator.userAgent,
      p_screen: (window.screen ? screen.width + 'x' + screen.height : null),
      p_device: device()
    };
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        keepalive: !!keepalive,
        headers: { 'Content-Type': 'application/json', 'apikey': C.anon, 'Authorization': 'Bearer ' + C.anon },
        body: JSON.stringify(body)
      }).catch(function () {});
    } catch (e) {}
  }

  // ---- API ----
  var API = {
    identify: function (u) {
      u = u || {};
      user.email = u.email || user.email;
      user.name  = u.name  || user.name;
      user.role  = u.role  || user.role;
      if (!started && user.email) begin();
    },
    event: function (name, meta) { post('action', Object.assign({ action: name }, meta || {})); },
    error: function (msg, meta) { post('error', Object.assign({ msg: String(msg) }, meta || {})); }
  };
  window.MasaruTrack = API;

  function begin() {
    if (started) return; started = true;
    post('page_view');
    beat = setInterval(function () {
      if (document.visibilityState === 'visible') post('heartbeat');
    }, HEARTBEAT_MS);
  }

  // จับคลิกปุ่มที่ติดป้าย data-track
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-track]') : null;
    if (el) API.event(el.getAttribute('data-track'));
  }, true);

  // ส่งตอนปิดหน้า
  window.addEventListener('pagehide', function () { if (started) post('exit', null, true); });
  document.addEventListener('visibilitychange', function () {
    if (started && document.visibilityState === 'hidden') post('exit', null, true);
  });

  // ---- ลองดึง identity จาก Supabase auth ที่อาจมีอยู่ในหน้า ----
  (function autoIdentify() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') > -1) {
          var v = JSON.parse(localStorage.getItem(k));
          var u = (v && (v.user || (v.currentSession && v.currentSession.user))) || null;
          if (u) {
            API.identify({
              email: u.email || null,
              name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || null,
              role: (u.user_metadata && u.user_metadata.role) || null
            });
            break;
          }
        }
      }
    } catch (e) {}
    // ถ้าหา identity ไม่เจอเลย ก็ยังเก็บแบบไม่ระบุตัว (email = null) เพื่อให้เห็นปริมาณการใช้
    if (!started) begin();
  })();
})();
