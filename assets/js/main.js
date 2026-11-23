/* ============================================================================
   main.js · 伴心 BANXIN 全站脚本（零依赖、零构建、classic script）
   —— 用 classic script 而非 ES Module，保证 file:// 双击也能跑（无 CORS 拦截）
   上游：site-spec F01–F20 / §5.3 状态机 / §5.4 错误码 / §6 接口契约；design-spec §10

   本文件分为 9 段：
     0  常量区（MOCK_MODE / API_BASE）      ← 接后端只改这两行
     1  工具与降级检测
     2  存储与去重（F16）
     3  吸顶栏 / 进度条 / 返回顶部 / 底部预购条（F02 F05 F06 F13）
     4  移动抽屉（F03）
     5  scrollspy（F04）
     6  入场动效 / 视差 / 打字机（F07 F08）
     7  手风琴（F14）
     8  影片弹窗（F15）
     9  表单：订阅 / 预购（F11 F12 F16 F17 F20）
   ============================================================================ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════════
     0. 常量区（site-spec §6.5：MOCK_MODE 与 API_BASE 只放在这里）
     ══════════════════════════════════════════════════════════════════════════ */
  var MOCK_MODE = true;   // P0 无后端：true 走同签名 Mock；接后端改 false
  var API_BASE = '';      // 例 'https://api.banxin.example.com'（不含末尾斜杠）

  var SEL = {
    header: '.site-header',
    progress: '.scroll-progress',
    toTop: '.to-top',
    buyBar: '.buy-bar',
    hero: '#hero',
    buy: '#buy',
    drawer: '#nav-drawer',
    hamburger: '#nav-toggle',
    navItems: '[data-nav]',
    reveal: '[data-reveal]',
    chapters: '[data-chapter]',
    modal: '#video-modal',
    modalOpen: '#open-video'
  };

  var KEY = {
    subscribed: 'bx.subscribed',
    preordered: 'bx.preordered'
  };

  /* ══════════════════════════════════════════════════════════════════════════
     1. 工具与降级检测
     ══════════════════════════════════════════════════════════════════════════ */
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function on(el, ev, fn, opts) {
    if (el) { el.addEventListener(ev, fn, opts || false); }
  }

  var mqReduce = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false, addEventListener: null };

  function prefersReduced() {
    return !!(mqReduce && mqReduce.matches);
  }

  function isMobile() {
    return window.innerWidth < 768;
  }

  function rafThrottle(fn) {
    var ticking = false;
    return function () {
      if (ticking) { return; }
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        fn();
      });
    };
  }

  function barHeight() {
    var h = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--bar-h')
    );
    return isNaN(h) ? (isMobile() ? 56 : 64) : h;
  }

  function prefersScrollBehavior() {
    return prefersReduced() ? 'auto' : 'smooth';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     2. 存储与去重（F16）—— 只存哈希，不存明文；不可用时静默降级
     ══════════════════════════════════════════════════════════════════════════ */
  var store = {
    get: function (key) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;                 // 隐私模式 / 禁用 storage：静默降级
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  /* FNV-1a 32bit，非加密哈希。仅用于本地去重标记，不承担任何安全职责。 */
  function hash32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     3. 吸顶栏 / 进度条 / 返回顶部 / 底部预购条（F02 F05 F06 F13）
     ══════════════════════════════════════════════════════════════════════════ */
  function initScrollChrome() {
    var header = $(SEL.header);
    var progress = $(SEL.progress);
    var toTop = $(SEL.toTop);
    var buyBar = $(SEL.buyBar);
    var hero = $(SEL.hero);
    var buy = $(SEL.buy);
    var lastBuyBarState = null;

    function update() {
      var y = window.pageYOffset || document.documentElement.scrollTop;
      var docH = document.documentElement.scrollHeight;
      var winH = window.innerHeight;
      var max = docH - winH;
      var p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;

      /* F02：>24px 加背景，回顶恢复透明 */
      if (header) {
        header.classList.toggle('is-scrolled', y > 24);
      }

      /* F05：transform: scaleX()，无 transition（跟手） */
      if (progress) {
        progress.style.setProperty('--p', p.toFixed(4));
      }

      /* F06：滚过 100svh 后出现 */
      var heroH = hero ? hero.offsetHeight : winH;
      var showTop = y > heroH;

      /* F13：<768 且已离开 #hero、尚未到达 #buy */
      var buyBarVisible = false;
      if (buyBar && hero && buy) {
        var leaveHero = y + barHeight() > hero.offsetTop + hero.offsetHeight - 120;
        var notYetBuy = buy.offsetTop > y + winH;
        buyBarVisible = isMobile() && leaveHero && notYetBuy;
        if (buyBarVisible !== lastBuyBarState) {
          buyBar.classList.toggle('is-visible', buyBarVisible);
          lastBuyBarState = buyBarVisible;
        }
      }

      if (toTop) {
        toTop.classList.toggle('is-visible', showTop);
        /* 与底部预购条让位：56 + 16（site-spec F13 冻结值） */
        toTop.classList.toggle('is-raised', !!(buyBar && buyBarVisible));
      }
    }

    var onScroll = rafThrottle(update);
    on(window, 'scroll', onScroll, { passive: true });
    on(window, 'resize', rafThrottle(function () {
      lastBuyBarState = null;
      update();
    }));
    update();

    /* F06：返回顶部 */
    on(toTop, 'click', function () {
      window.scrollTo({ top: 0, behavior: prefersScrollBehavior() });
      var skip = $('.skip-link');
      if (skip) { skip.focus({ preventScroll: true }); }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     4. 移动抽屉（F03）—— 焦点陷阱 + Esc + 滚动锁 + 不跳位
     ══════════════════════════════════════════════════════════════════════════ */
  var scrollLock = (function () {
    var locked = false;
    var savedY = 0;
    var savedStyle = '';

    return {
      lock: function () {
        if (locked) { return; }
        savedY = window.pageYOffset || document.documentElement.scrollTop;
        savedStyle = document.body.getAttribute('style') || '';
        var b = document.body;
        b.style.position = 'fixed';
        b.style.top = -savedY + 'px';
        b.style.left = '0';
        b.style.right = '0';
        b.style.width = '100%';
        b.style.overflow = 'hidden';
        locked = true;
      },
      unlock: function () {
        if (!locked) { return; }
        var b = document.body;
        if (savedStyle) {
          b.setAttribute('style', savedStyle);
        } else {
          b.removeAttribute('style');
        }
        locked = false;
        window.scrollTo(0, savedY);      // 恢复位置，不跳位
      }
    };
  })();

  var FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function trapFocus(container, e) {
    var items = $$(FOCUSABLE, container).filter(function (el) {
      return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
    });
    if (!items.length) { return; }
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function initDrawer() {
    var drawer = $(SEL.drawer);
    var toggle = $(SEL.hamburger);
    if (!drawer || !toggle) { return; }

    var lastFocused = null;

    /* 抽屉列表项依次入场（§10.6：40ms 间隔，最多前 6 项） */
    $$('.drawer__item', drawer).forEach(function (item, i) {
      item.style.setProperty('--i', Math.min(i, 5));
    });

    function open() {
      lastFocused = document.activeElement;
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      toggle.setAttribute('aria-expanded', 'true');
      scrollLock.lock();
      var first = $$(FOCUSABLE, drawer)[0];
      if (first) { first.focus(); }
    }

    function close(returnFocus) {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      toggle.setAttribute('aria-expanded', 'false');
      scrollLock.unlock();
      if (returnFocus !== false) {
        /* 必须落回汉堡按钮：鼠标点击在部分平台不会让按钮获得焦点，
           lastFocused 会退化成 <body>，focus() 变成空操作 —— 所以显式兜底 toggle。 */
        var back = (lastFocused && lastFocused !== document.body) ? lastFocused : toggle;
        back.focus({ preventScroll: true });
      }
    }

    on(toggle, 'click', function () {
      if (drawer.classList.contains('is-open')) {
        close();
      } else {
        open();
      }
    });

    $$('[data-drawer-close]', drawer).forEach(function (btn) {
      on(btn, 'click', function () { close(); });
    });

    /* 点任一锚点后关闭并滚动（滚动交给原生 scroll-margin-top） */
    $$('a[href^="#"]', drawer).forEach(function (a) {
      on(a, 'click', function () {
        var id = a.getAttribute('href').slice(1);
        var target = document.getElementById(id);
        close(false);
        if (target) {
          window.setTimeout(function () {
            window.scrollTo({
              top: target.getBoundingClientRect().top + window.pageYOffset - (barHeight() + 12),
              behavior: prefersScrollBehavior()
            });
          }, 0);
        }
      });
    });

    on(document, 'keydown', function (e) {
      if (!drawer.classList.contains('is-open')) { return; }
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'Tab') {
        trapFocus(drawer, e);
      }
    });

    /* 视口放大到 ≥768 时自动收起，避免遗留锁滚动 */
    on(window, 'resize', rafThrottle(function () {
      if (!isMobile() && drawer.classList.contains('is-open')) {
        close(false);
      }
    }));
  }

  /* ══════════════════════════════════════════════════════════════════════════
     5. scrollspy（F04）—— 严格按 site-spec §4.2 映射，120ms 防抖
     ══════════════════════════════════════════════════════════════════════════ */
  var SPY_MAP = {
    hero: null,          // 无高亮
    prologue: 'prologue',
    product: 'product',
    features: 'product', // 悬空区块延续「产品」
    chapters: 'chapters',
    specs: 'specs',
    news: 'news',
    buy: 'buy',          // 高亮购买按钮
    support: 'support',
    footer: 'support'    // 页脚延续「支持」
  };

  function initScrollSpy() {
    var sections = $$('#main > section, #main > div, .site-footer')
      .concat($$('.site-footer'));
    var ids = Object.keys(SPY_MAP);
    var items = $$(SEL.navItems);
    if (!items.length) { return; }

    /* 只取 10 个冻结区块，按 DOM 顺序 */
    var nodes = ids
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);

    if (!nodes.length) { return; }

    var activeKey = '__init__';

    function compute() {
      var line = (window.pageYOffset || 0) + barHeight() + 8;
      var current = nodes[0].id;
      for (var i = 0; i < nodes.length; i += 1) {
        var top = nodes[i].getBoundingClientRect().top + window.pageYOffset;
        if (top <= line) { current = nodes[i].id; }
      }
      var key = SPY_MAP[current];
      if (key === activeKey) { return; }
      activeKey = key;

      items.forEach(function (el) {
        var isCurrent = key !== null && el.getAttribute('data-nav') === key;
        if (isCurrent) {
          el.setAttribute('aria-current', 'true');
        } else {
          el.removeAttribute('aria-current');
        }
        /* 购买按钮的高亮态换底色（§4.2：高亮态非文本项高亮） */
        if (el.classList.contains('btn-buy')) {
          el.classList.toggle('is-current', isCurrent);
        }
      });
    }

    var timer = null;
    on(window, 'scroll', function () {
      if (timer) { window.clearTimeout(timer); }
      timer = window.setTimeout(compute, 120);   // 120ms 防抖，快速滚动不闪
    }, { passive: true });

    on(window, 'resize', rafThrottle(compute));
    compute();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     6. 入场动效 / 视差 / 打字机（F07 F08）
     ══════════════════════════════════════════════════════════════════════════ */
  function initReveal() {
    /* stagger：用 JS 写 --reveal-delay，不用 nth-child 硬写规则（§10.3） */
    $$('[data-stagger]').forEach(function (group) {
      var step = parseInt(group.getAttribute('data-stagger'), 10) || 120;
      $$(SEL.reveal, group).forEach(function (el, i) {
        el.style.setProperty('--reveal-delay', i * step + 'ms');
      });
    });

    var targets = $$(SEL.reveal).concat($$('[data-typing]'));
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) {
        el.classList.add('is-visible');
        el.classList.add('is-typed');
      });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        var el = entry.target;
        if (el.hasAttribute('data-typing')) {
          if (!prefersReduced()) { el.classList.add('typing'); }
          el.classList.add('is-typed');
        } else {
          el.classList.add('is-visible');
        }
        io.unobserve(el);                       // 只播一次，回滚不重播
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -10% 0px'
    });

    targets.forEach(function (el) { io.observe(el); });
  }

  function initChapterReveal() {
    var chapters = $$(SEL.chapters);
    if (!chapters.length) { return; }
    if (!('IntersectionObserver' in window) || prefersReduced()) {
      chapters.forEach(function (c) { c.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
    chapters.forEach(function (c) { io.observe(c); });
  }

  function initParallax() {
    var targets = $$('[data-parallax]');
    if (!targets.length) { return; }

    function update() {
      if (prefersReduced() || isMobile()) {
        targets.forEach(function (el) { el.style.setProperty('--p', '0'); });
        return;
      }
      var winH = window.innerHeight;
      targets.forEach(function (el) {
        var box = el.getBoundingClientRect();
        /* -1（刚进入底部）→ 1（刚离开顶部），取一半映射到 0→1 */
        var raw = 1 - (box.top + box.height / 2) / winH;
        var p = Math.min(1, Math.max(0, raw));
        el.style.setProperty('--p', p.toFixed(3));
      });
    }

    var onScroll = rafThrottle(update);
    on(window, 'scroll', onScroll, { passive: true });
    on(window, 'resize', onScroll);
    update();
    if (mqReduce && mqReduce.addEventListener) {
      mqReduce.addEventListener('change', update);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     7. 手风琴（F14）—— <details> 原生，同一时间只展开 1 条
     ══════════════════════════════════════════════════════════════════════════ */
  function initAccordion() {
    $$('[data-accordion]').forEach(function (group) {
      var items = $$('details', group);
      items.forEach(function (item) {
        on(item, 'toggle', function () {
          if (!item.open) { return; }
          items.forEach(function (other) {
            if (other !== item && other.open) { other.open = false; }
          });
        });
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     8. 影片弹窗（F15）
     ══════════════════════════════════════════════════════════════════════════ */
  function initModal() {
    var modal = $(SEL.modal);
    var opener = $(SEL.modalOpen);
    if (!modal || !opener) { return; }

    var panel = $('.modal__panel', modal);
    var lastFocused = null;

    function open() {
      lastFocused = document.activeElement;
      modal.classList.add('is-open');
      modal.removeAttribute('hidden');
      modal.setAttribute('aria-hidden', 'false');
      opener.setAttribute('aria-expanded', 'true');
      scrollLock.lock();
      var first = $$(FOCUSABLE, panel)[0];
      if (first) {
        window.setTimeout(function () { first.focus(); }, 30);
      }
    }

    function close(returnFocus) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      opener.setAttribute('aria-expanded', 'false');
      scrollLock.unlock();
      if (returnFocus !== false) {
        (lastFocused || opener).focus({ preventScroll: true });
      }
    }

    on(opener, 'click', open);

    $$('[data-modal-close]', modal).forEach(function (el) {
      on(el, 'click', function () { close(); });
    });

    on(modal, 'click', function (e) {
      if (e.target === modal || e.target.classList.contains('modal__overlay')) {
        close();
      }
    });

    on(document, 'keydown', function (e) {
      if (!modal.classList.contains('is-open')) { return; }
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'Tab') { trapFocus(panel, e); }
    });

    /* 弹窗内「先看看产品」：关闭并滚到 #product */
    $$('[data-modal-goto]', modal).forEach(function (link) {
      on(link, 'click', function (e) {
        e.preventDefault();
        var target = document.getElementById(link.getAttribute('data-modal-goto'));
        close(false);
        if (target) {
          window.scrollTo({
            top: target.getBoundingClientRect().top + window.pageYOffset - (barHeight() + 12),
            behavior: prefersScrollBehavior()
          });
        }
      });
    });

    return { close: close };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     9. 表单（F11 F12 F16 F17 F20）
     ══════════════════════════════════════════════════════════════════════════ */
  var COPY = {
    EMAIL_MISSING: '还没填邮箱。',
    EMAIL_INVALID: '这个邮箱好像少了点什么，检查一下？比如 name@example.com',
    CONSENT_SUBSCRIBE: '还需要勾一下同意，我们才能给你寄信。',
    CONSENT_PREORDER: '还需要勾一下同意，我们才能联系你。',
    EMAIL_EXISTS: '你已经在名单里了，不用再订一次。',
    RATE_LIMITED: '提交得有点快，{{n}} 秒后再试。',
    SERVER_ERROR: '我们这边出了点问题，不是你的操作。过几分钟再试一次。',
    NETWORK_ERROR: '网络好像断了，检查一下再试一次？',
    NAME_INVALID: '称呼写 2 到 20 个字，中英文都可以。',
    CONTACT_PHONE: '手机号是 11 位数字，再看一眼？',
    CONTACT_EMAIL: '这个邮箱好像少了点什么，检查一下？',
    CONTACT_TYPE: '先选一个联系方式，手机号或者邮箱。',
    QUANTITY_INVALID: '数量可以选 1 到 5 台。',
    SKU_UNAVAILABLE: '这批已经订完。留个邮箱，下一批开放时先告诉你。',
    DUPLICATE_SUBMISSION: '我们 10 分钟前收到过你的信息了，不用重复提交。'
  };

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
  var PHONE_RE = /^1[3-9]\d{9}$/;
  var NAME_RE = /^[\u4e00-\u9fa5A-Za-z·\s]+$/;

  function validEmail(v) {
    var s = String(v || '').trim();
    if (s.length < 6 || s.length > 254) { return false; }
    if (s.indexOf('@') < 0) { return false; }
    if (s.split('@')[0].length > 64) { return false; }
    return EMAIL_RE.test(s);
  }

  function isChineseOrSpace(v) {
    return /[\u4e00-\u9fa5\s]/.test(v);
  }

  function validName(v) {
    var s = String(v || '').trim();
    if (s.length < 2 || s.length > 20) { return false; }
    if (/[<>]/.test(s)) { return false; }
    if (!NAME_RE.test(s)) { return false; }
    if (/^[\d\s·]+$/.test(s)) { return false; }         // 禁止纯数字 / 纯符号
    if (!isChineseOrSpace(s) && s.replace(/[\s·]/g, '').length < 2) { return false; }
    return true;
  }

  /* ── 接口层：唯一包含 Mock 与真实请求分支的地方（site-spec §6.5）──────── */
  var MOCK_DB = { emails: {}, contacts: {} };

  function mockDelay() {
    return 600 + Math.round(Math.random() * 300);
  }

  function envelopeOk(data) {
    return { ok: true, data: data };
  }

  function envelopeErr(code, field) {
    return { ok: false, error: { code: code, message: code, field: field || null } };
  }

  function pad(n, len) {
    var s = String(n);
    while (s.length < len) { s = '0' + s; }
    return s;
  }

  function pseudoId(prefix, len) {
    var t = String(Date.now());
    var seed = t + String(Math.random());
    var out = '';
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var h = hash32(seed);
    for (var i = 0; i < len; i += 1) {
      out += chars.charAt(parseInt(h.slice(i % 6, (i % 6) + 2), 16) % chars.length);
    }
    return prefix + out;
  }

  function intentNo() {
    var d = new Date();
    var ymd = String(d.getFullYear()) + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2);
    var seq = pad(Math.floor(Math.random() * 999999) + 1, 6);
    return 'BX' + ymd + seq;
  }

  function apiSubscribe(payload) {
    if (!MOCK_MODE) {
      return fetch(API_BASE + '/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().then(function (json) {
          if (json && json.ok) { return json; }
          return { ok: false, error: (json && json.error) || { code: 'SERVER_ERROR', message: 'SERVER_ERROR', field: null } };
        });
      }).catch(function () {
        return envelopeErr('NETWORK_ERROR', null);
      });
    }

    return new Promise(function (resolve) {
      window.setTimeout(function () {
        if (!validEmail(payload.email)) {
          resolve(envelopeErr('EMAIL_INVALID', 'email'));
          return;
        }
        if (payload.consent !== true) {
          resolve(envelopeErr('CONSENT_REQUIRED', 'consent'));
          return;
        }
        var key = String(payload.email).trim().toLowerCase();
        if (MOCK_DB.emails[key]) {
          resolve(envelopeErr('EMAIL_EXISTS', 'email'));
          return;
        }
        MOCK_DB.emails[key] = true;
        resolve(envelopeOk({
          id: pseudoId('sub_', 12),
          email: key,
          status: 'pending_confirm',
          created_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z')
        }));
      }, mockDelay());
    });
  }

  function apiPreorder(payload) {
    if (!MOCK_MODE) {
      return fetch(API_BASE + '/api/preorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().then(function (json) {
          if (json && json.ok) { return json; }
          return { ok: false, error: (json && json.error) || { code: 'SERVER_ERROR', message: 'SERVER_ERROR', field: null } };
        });
      }).catch(function () {
        return envelopeErr('NETWORK_ERROR', null);
      });
    }

    return new Promise(function (resolve) {
      window.setTimeout(function () {
        if (!validName(payload.name)) {
          resolve(envelopeErr('NAME_INVALID', 'name'));
          return;
        }
        if (payload.contact_type !== 'phone' && payload.contact_type !== 'email') {
          resolve(envelopeErr('INVALID_CONTACT_TYPE', 'contact_type'));
          return;
        }
        var cv = String(payload.contact_value || '').trim();
        var okContact = payload.contact_type === 'phone' ? PHONE_RE.test(cv) : validEmail(cv);
        if (!okContact) {
          resolve(envelopeErr('CONTACT_INVALID', 'contact_value'));
          return;
        }
        if (payload.sku !== 'flagship_white') {
          resolve(envelopeErr('SKU_INVALID', 'sku'));
          return;
        }
        if (!(Number.isInteger(payload.quantity) && payload.quantity >= 1 && payload.quantity <= 5)) {
          resolve(envelopeErr('QUANTITY_INVALID', 'quantity'));
          return;
        }
        if (payload.consent !== true) {
          resolve(envelopeErr('CONSENT_REQUIRED', 'consent'));
          return;
        }
        var dupKey = payload.contact_type + ':' + cv.toLowerCase();
        var now = Date.now();
        if (MOCK_DB.contacts[dupKey] && now - MOCK_DB.contacts[dupKey] < 10 * 60 * 1000) {
          resolve(envelopeErr('DUPLICATE_SUBMISSION', null));
          return;
        }
        MOCK_DB.contacts[dupKey] = now;
        resolve(envelopeOk({
          intent_no: intentNo(),
          sku: payload.sku,
          sku_name: '伴心旗舰版 · 白色',
          quantity: payload.quantity,
          unit_price_cents: 99900,
          total_price_cents: 99900 * payload.quantity,
          status: 'intent_received',
          created_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z')
        }));
      }, mockDelay());
    });
  }

  /* ── 表单 DOM 工具 ─────────────────────────────────────────────────────── */
  function fieldOf(el) {
    return el ? el.closest('.field') : null;
  }

  function clearErrors(form) {
    $$('.field.is-invalid', form).forEach(function (f) {
      f.classList.remove('is-invalid');
    });
    $$('[aria-invalid="true"]', form).forEach(function (el) {
      el.removeAttribute('aria-invalid');
    });
    /* 每次提交前把上一轮的文案一起抹掉：这一轮合法的字段不会再被 setFieldError 覆盖，
       留着旧句子就会「红色没了、错误还在 DOM 里」（E-10）。 */
    $$('.field__error', form).forEach(function (err) {
      err.textContent = '';
      err.removeAttribute('role');
    });
    var alert = $('[data-alert]', form);
    if (alert) {
      alert.classList.remove('is-visible');
      alert.textContent = '';
    }
  }

  function setFieldError(input, message) {
    var field = fieldOf(input);
    if (!field) { return; }
    field.classList.add('is-invalid');
    if (input) { input.setAttribute('aria-invalid', 'true'); }
    var err = $('.field__error', field);
    if (err) {
      err.textContent = message;
      err.setAttribute('role', 'alert');
    }
  }

  /* E-10：错误文案必须随输入一起消失。
     只 removeAttribute('aria-invalid') 是不够的 —— .field__error 的旧文本还留在 DOM 里，
     既会被 aria-describedby 读出来（display:none 仍可被 AT 取到），
     也会在下次报错时先闪一下上一轮的话。所以整条错误状态一起清。 */
  function clearFieldError(input) {
    var field = fieldOf(input);
    if (!field) { return; }
    field.classList.remove('is-invalid');
    if (input) { input.removeAttribute('aria-invalid'); }
    var err = $('.field__error', field);
    if (err) {
      err.textContent = '';
      err.removeAttribute('role');
    }
  }

  function setFormAlert(form, type, message) {
    var alert = $('[data-alert]', form);
    if (!alert) { return; }
    alert.className = 'form-alert form-alert--' + type + ' is-visible';
    alert.textContent = message;
    alert.setAttribute('role', 'alert');
  }

  function setLoading(btn, on, label) {
    if (!btn) { return; }
    if (on) {
      btn.dataset.label = btn.dataset.label || btn.innerHTML;
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      btn.innerHTML = label;
    } else {
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
      if (btn.dataset.label) { btn.innerHTML = btn.dataset.label; }
    }
  }

  /* F17：提交后 60s 内按钮禁用 + 倒计时（复用 RATE_LIMITED 文案，不新造句子） */
  function startCooldown(form, seconds) {
    var btn = $('[type="submit"]', form);
    var remain = seconds;
    if (form.__cdTimer) { window.clearInterval(form.__cdTimer); }
    if (btn) { btn.disabled = true; }
    setFormAlert(form, 'warning', COPY.RATE_LIMITED.replace('{{n}}', remain));
    form.__cdTimer = window.setInterval(function () {
      remain -= 1;
      if (remain <= 0) {
        window.clearInterval(form.__cdTimer);
        form.__cdTimer = null;
        if (btn) { btn.disabled = false; }
        var alert = $('[data-alert]', form);
        if (alert) {
          alert.classList.remove('is-visible');
          alert.textContent = '';
        }
        return;
      }
      setFormAlert(form, 'warning', COPY.RATE_LIMITED.replace('{{n}}', remain));
    }, 1000);
  }

  function showSuccess(form, html) {
    var card = form.parentNode.querySelector('[data-success]');
    form.setAttribute('data-state', 'success');
    form.hidden = true;
    if (card) {
      var body = $('[data-success-body]', card);
      if (body) { body.innerHTML = html; }
      card.classList.add('is-visible');
      card.setAttribute('tabindex', '-1');
      card.focus({ preventScroll: true });
    }
  }

  /* ── 订阅表单（F11）───────────────────────────────────────────────────── */
  function initSubscribeForm(form) {
    var emailInput = form.querySelector('[name="email"]');
    var consentInput = form.querySelector('[name="consent"]');
    var btn = form.querySelector('[type="submit"]');
    var source = form.getAttribute('data-source') || 'news_section';
    var hp = form.querySelector('[name="honeypot"]');

    if (btn) { btn.style.setProperty('--btn-lock', '148px'); }

    function validate() {
      clearErrors(form);
      var bad = null;
      var v = emailInput ? emailInput.value : '';
      if (!String(v).trim()) {
        setFieldError(emailInput, COPY.EMAIL_MISSING);
        bad = bad || emailInput;
      } else if (!validEmail(v)) {
        setFieldError(emailInput, COPY.EMAIL_INVALID);
        bad = bad || emailInput;
      }
      if (consentInput && !consentInput.checked) {
        setFieldError(consentInput, COPY.CONSENT_SUBSCRIBE);
        bad = bad || consentInput;
      }
      if (bad) {
        bad.focus();
        return false;
      }
      return true;
    }

    /* 字段级错误只在 blur / submit 后出现，不在 input 时打断输入（S1）；
       一旦开始改，旧错误连同文案一起清掉（E-10），下一次 blur / submit 重新判。 */
    if (emailInput) {
      on(emailInput, 'blur', function () {
        if (emailInput.value && !validEmail(emailInput.value)) {
          setFieldError(emailInput, COPY.EMAIL_INVALID);
        }
      });
      on(emailInput, 'input', function () {
        clearFieldError(emailInput);
      });
    }
    if (consentInput) {
      on(consentInput, 'change', function () {
        if (consentInput.checked) {
          clearFieldError(consentInput);
        }
      });
    }

    on(form, 'submit', function (e) {
      e.preventDefault();
      if (btn && btn.disabled) { return; }
      if (!validate()) { return; }

      var payload = {
        email: String(emailInput.value).trim(),
        source: source,
        consent: true,
        locale: 'zh-CN',
        honeypot: hp ? hp.value : ''
      };

      setLoading(btn, true, '订阅中…');

      apiSubscribe(payload).then(function (res) {
        setLoading(btn, false);

        if (res.ok) {
          store.set(KEY.subscribed, {
            h: hash32(payload.email.toLowerCase()),
            at: Date.now()
          });
          showSuccess(
            form,
            '第一封信会在发货前寄到 <span class="mono">' +
              res.data.email.replace(/</g, '&lt;') +
              '</span>。'
          );
          return;
        }

        var code = res.error.code;

        /* 契约 §6.2：EMAIL_EXISTS 前端按成功处理 */
        if (code === 'EMAIL_EXISTS') {
          store.set(KEY.subscribed, { h: hash32(payload.email.toLowerCase()), at: Date.now() });
          showSuccess(form, COPY.EMAIL_EXISTS);
          return;
        }

        if (code === 'EMAIL_INVALID') {
          setFieldError(emailInput, COPY.EMAIL_INVALID);
          emailInput.focus();
          return;
        }
        if (code === 'CONSENT_REQUIRED') {
          setFieldError(consentInput, COPY.CONSENT_SUBSCRIBE);
          if (consentInput) { consentInput.focus(); }
          return;
        }
        if (code === 'RATE_LIMITED') {
          startCooldown(form, 60);
          return;
        }
        if (code === 'INVALID_SOURCE') {
          if (window.console) { window.console.error('[banxin] INVALID_SOURCE', source); }
          return;
        }
        setFormAlert(form, 'danger', COPY[code] || COPY.SERVER_ERROR);
      });
    });
  }

  /* ── 预购表单（F12）──────────────────────────────────────────────────── */
  function initPreorderForm(form) {
    var nameInput = form.querySelector('[name="name"]');
    var contactValue = form.querySelector('[name="contact_value"]');
    var contactTypes = $$('[name="contact_type"]', form);
    var qtyInput = form.querySelector('[name="quantity"]');
    var consentInput = form.querySelector('[name="consent"]');
    var btn = form.querySelector('[type="submit"]');
    var hp = form.querySelector('[name="honeypot"]');
    var contactLabel = form.querySelector('[data-contact-label]');
    var stepBtns = $$('[data-step]', form);

    if (btn) { btn.style.setProperty('--btn-lock', '200px'); }

    function contactType() {
      for (var i = 0; i < contactTypes.length; i += 1) {
        if (contactTypes[i].checked) { return contactTypes[i].value; }
      }
      return '';
    }

    function syncContactType() {
      var t = contactType();
      if (!contactValue) { return; }
      if (t === 'email') {
        contactValue.setAttribute('type', 'email');
        contactValue.setAttribute('placeholder', '请输入邮箱地址');
        contactValue.setAttribute('inputmode', 'email');
        contactValue.setAttribute('autocomplete', 'email');
        if (contactLabel) { contactLabel.textContent = '邮箱地址'; }
      } else {
        contactValue.setAttribute('type', 'tel');
        contactValue.setAttribute('placeholder', '请输入手机号');
        contactValue.setAttribute('inputmode', 'numeric');
        contactValue.setAttribute('autocomplete', 'tel');
        if (contactLabel) { contactLabel.textContent = '手机号'; }
      }
      contactValue.value = '';
      /* 切联系方式等于换了一个字段：旧值已被清空，旧错误也一起清（E-10） */
      clearFieldError(contactValue);
      if (contactTypes.length) { clearFieldError(contactTypes[0]); }
    }

    contactTypes.forEach(function (r) { on(r, 'change', syncContactType); });
    syncContactType();

    /* 数量步进器 */
    function setQty(next) {
      if (!qtyInput) { return; }
      var v = Math.min(5, Math.max(1, next));
      qtyInput.value = String(v);
      stepBtns.forEach(function (b) {
        var step = parseInt(b.getAttribute('data-step'), 10);
        b.disabled = (step < 0 && v <= 1) || (step > 0 && v >= 5);
      });
      clearFieldError(qtyInput);
    }

    stepBtns.forEach(function (b) {
      on(b, 'click', function () {
        var cur = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;
        setQty(cur + parseInt(b.getAttribute('data-step'), 10));
      });
    });

    if (qtyInput) {
      on(qtyInput, 'change', function () {
        var v = parseInt(qtyInput.value, 10);
        setQty(isNaN(v) ? 1 : v);
      });
    }
    setQty(1);

    function validate() {
      clearErrors(form);
      var bad = null;

      if (!validName(nameInput ? nameInput.value : '')) {
        setFieldError(nameInput, COPY.NAME_INVALID);
        bad = bad || nameInput;
      }

      var t = contactType();
      var cv = contactValue ? String(contactValue.value).trim() : '';
      if (!t) {
        setFieldError(contactTypes[0], COPY.CONTACT_TYPE);
        bad = bad || contactTypes[0];
      } else if (!cv) {
        setFieldError(contactValue, t === 'phone' ? COPY.CONTACT_PHONE : COPY.CONTACT_EMAIL);
        bad = bad || contactValue;
      } else if (t === 'phone' && !PHONE_RE.test(cv)) {
        setFieldError(contactValue, COPY.CONTACT_PHONE);
        bad = bad || contactValue;
      } else if (t === 'email' && !validEmail(cv)) {
        setFieldError(contactValue, COPY.CONTACT_EMAIL);
        bad = bad || contactValue;
      }

      var q = qtyInput ? parseInt(qtyInput.value, 10) : NaN;
      if (!(q >= 1 && q <= 5)) {
        setFieldError(qtyInput, COPY.QUANTITY_INVALID);
        bad = bad || qtyInput;
      }

      if (consentInput && !consentInput.checked) {
        setFieldError(consentInput, COPY.CONSENT_PREORDER);
        bad = bad || consentInput;
      }

      if (bad) {
        bad.focus();
        return false;
      }
      return true;
    }

    if (nameInput) {
      on(nameInput, 'blur', function () {
        if (nameInput.value && !validName(nameInput.value)) {
          setFieldError(nameInput, COPY.NAME_INVALID);
        }
      });
      on(nameInput, 'input', function () { clearFieldError(nameInput); });
    }
    if (contactValue) {
      on(contactValue, 'input', function () { clearFieldError(contactValue); });
    }
    contactTypes.forEach(function (r) {
      on(r, 'change', function () { clearFieldError(r); });
    });
    if (consentInput) {
      on(consentInput, 'change', function () {
        if (consentInput.checked) {
          clearFieldError(consentInput);
        }
      });
    }

    on(form, 'submit', function (e) {
      e.preventDefault();
      if (btn && btn.disabled) { return; }
      if (!validate()) { return; }

      var params = new URLSearchParams(window.location.search);
      var payload = {
        name: String(nameInput.value).trim(),
        contact_type: contactType(),
        contact_value: String(contactValue.value).trim(),
        sku: (form.querySelector('[name="sku"]:checked') || { value: 'flagship_white' }).value,
        quantity: parseInt(qtyInput.value, 10),
        consent: true,
        channel: params.get('utm_source') || 'web_direct',
        remark: '',
        honeypot: hp ? hp.value : ''
      };

      setLoading(btn, true, '提交中…');

      apiPreorder(payload).then(function (res) {
        setLoading(btn, false);

        if (res.ok) {
          store.set(KEY.preordered, {
            h: hash32((payload.contact_type + ':' + payload.contact_value).toLowerCase()),
            intentNo: res.data.intent_no,
            at: Date.now()
          });
          showSuccess(
            form,
            '你的意向编号是 <span class="mono">' +
              res.data.intent_no +
              '</span>。发货时间定了，我们会先联系你。'
          );
          return;
        }

        var code = res.error.code;

        if (code === 'NAME_INVALID') {
          setFieldError(nameInput, COPY.NAME_INVALID);
          nameInput.focus();
          return;
        }
        if (code === 'CONTACT_INVALID') {
          setFieldError(
            contactValue,
            payload.contact_type === 'phone' ? COPY.CONTACT_PHONE : COPY.CONTACT_EMAIL
          );
          contactValue.focus();
          return;
        }
        if (code === 'INVALID_CONTACT_TYPE') {
          setFieldError(contactTypes[0], COPY.CONTACT_TYPE);
          return;
        }
        if (code === 'QUANTITY_INVALID') {
          setFieldError(qtyInput, COPY.QUANTITY_INVALID);
          return;
        }
        if (code === 'CONSENT_REQUIRED') {
          setFieldError(consentInput, COPY.CONSENT_PREORDER);
          consentInput.focus();
          return;
        }
        if (code === 'RATE_LIMITED') {
          startCooldown(form, 60);
          return;
        }
        setFormAlert(form, 'danger', COPY[code] || COPY.SERVER_ERROR);
      });
    });
  }

  /* ── 表单初始化 + F16 回访去重 ─────────────────────────────────────────── */
  function initForms() {
    $$('form[data-form="subscribe"]').forEach(function (form) {
      initSubscribeForm(form);
      /* 回访：本地已有订阅标记 → 直接呈成功态（邮箱不存明文，复用既有文案） */
      if (store.get(KEY.subscribed)) {
        showSuccess(form, COPY.EMAIL_EXISTS);
      }
    });

    $$('form[data-form="preorder"]').forEach(function (form) {
      initPreorderForm(form);
      var saved = store.get(KEY.preordered);
      if (saved && saved.intentNo) {
        showSuccess(
          form,
          '你的意向编号是 <span class="mono">' +
            String(saved.intentNo).replace(/</g, '&lt;') +
            '</span>。发货时间定了，我们会先联系你。'
        );
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     10. 启动
     ══════════════════════════════════════════════════════════════════════════ */
  function boot() {
    document.documentElement.classList.add('js-enabled');

    initScrollChrome();
    initDrawer();
    initScrollSpy();
    initReveal();
    initChapterReveal();
    initParallax();
    initAccordion();
    initModal();
    initForms();

    /* 首屏元素用 CSS 动画直接播（§10.2），不依赖 IO */
    if (prefersReduced() && window.console) {
      window.console.info('[banxin] prefers-reduced-motion: reduce —— 已关闭位移与视差');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/* ════════════════════════════════════════════════════════════════════════════
   段 4 · 3D 麦金塔抽屉 —— 渐进增强加载
   ────────────────────────────────────────────────────────────────────────────
   为什么单独一块、不放主 IIFE：它是唯一需要下载 2.3MB 二进制的能力，
   必须能被整体跳过而不影响其他任何交互。

   三级策略：
     ① 永不加载（默认）：poster WebP ~40KB，任何设备都能看。
     ② 条件满足才加载：≥768px + 未开启减少动效 + 非省流/2G/3G + 有 WebGL。
     ③ 进入视口前 200px 才真正拉 GLB（model-viewer 运行时 290KB gzip 一并懒加载）。

   已知限制（实测得出，别再试「调参数解决」）：
     model-viewer 的 auto-fit 只按模型静态包围盒计算，抽屉展开后比包围盒宽约 8.5%。
     camera-orbit 的 radius（百分比与绝对米都试过）在这个渲染路径下不生效，
     只有 field-of-view 生效。所以溢出只能靠单列布局留白吸收，不能靠拉远相机。
   ════════════════════════════════════════════════════════════════════════════ */
(function initDock3D() {
  'use strict';

  var stage = document.querySelector('[data-dock]');
  if (!stage) { return; }

  var GLB = '/assets/models/Banxin_Macintosh.motion.glb';
  var RUNTIME = '/assets/js/model-viewer.min.js';
  var CLIP = 'BanxinMac_DrawerShow';
  var FOV = '24deg';
  var started = false;
  var mvEl = null;

  function prefersReduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function isWide() {
    return window.matchMedia && window.matchMedia('(min-width: 768px)').matches;
  }
  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  function networkOK() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) { return true; }
    if (c.saveData === true) { return false; }
    return !/(^|-)2g$|(^|-)3g$/.test(c.effectiveType || '');
  }

  /* 任一条不满足 → 停在 poster，不再有任何网络请求 */
  if (prefersReduced() || !isWide() || !hasWebGL() || !networkOK()) { return; }

  function loadRuntime() {
    if (window.customElements && window.customElements.get('model-viewer')) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.type = 'module';
      s.src = RUNTIME;
      s.onload = function () {
        if (window.customElements && window.customElements.whenDefined) {
          window.customElements.whenDefined('model-viewer').then(resolve, reject);
        } else { resolve(); }
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function boot() {
    if (started) { return; }
    started = true;

    loadRuntime().then(function () {
      var poster = stage.querySelector('.dock-poster');
      var alt = poster ? poster.getAttribute('alt') : '';

      mvEl = document.createElement('model-viewer');
      mvEl.setAttribute('alt', alt);
      mvEl.setAttribute('src', GLB);
      mvEl.setAttribute('animation-name', CLIP);
      mvEl.setAttribute('autoplay', '');
      mvEl.setAttribute('loop', '');
      mvEl.setAttribute('camera-orbit', '25deg 68deg 105%');
      /* camera-target 不是装饰，是必需的补偿：
         抽屉拉开后视觉重心向左前方（-Z）偏移约 8.5%，而 model-viewer 的 auto-fit
         只按「静态包围盒」计算取景，所以默认视角下抽屉会被画布左边缘和下边缘裁掉
         （实测：左 0px / 下 1px，即贴边）。这组值经四边留白实测选定，
         五个动画状态（闭合/拉出中/拉出/打字完/回收）全部不裁边：
         展开态 左19 右27 上33 下15；闭合态 左127 右27 上33 下15（容器 640×800）。
         改任一分量前先复用 tools/verify-dock-frames.mjs 重测，否则会静默裁边。 */
      mvEl.setAttribute('camera-target', '-0.05m 0.06m 0m');
      mvEl.setAttribute('exposure', '1.05');
      mvEl.setAttribute('shadow-intensity', '0.5');
      mvEl.setAttribute('shadow-softness', '0.9');
      mvEl.setAttribute('environment-image', 'neutral');
      mvEl.setAttribute('interaction-prompt', 'none');
      mvEl.setAttribute('disable-tap', '');
      /* 必须是 eager：外面这段代码已经用 IntersectionObserver 决定「何时才创建元素」，
         再叠一层 loading="lazy" 会出现「我等你进视口、你等我连接」的双重惰性，
         结果是元素建好了但 GLB 一个字节都不请求（实测：anims=[]、glbBytes=[]）。 */
      mvEl.setAttribute('loading', 'eager');

      /* 只在真正渲染出第一帧后才把 poster 换掉 —— 否则会闪一下空白 */
      mvEl.addEventListener('load', function () {
        stage.classList.add('is-live');
      }, { once: true });

      /* 失败就退回 poster，并把状态复位让下次滚动还能重试 */
      mvEl.addEventListener('error', function (e) {
        if (window.console) {
          var t = (e.detail && e.detail.type) || 'unknown';
          window.console.warn('[banxin] 3D 加载失败，已回退静态图：' + t);
        }
        if (mvEl && mvEl.parentNode) { mvEl.parentNode.removeChild(mvEl); }
        mvEl = null;
        stage.classList.remove('is-live');
        started = false;
      }, { once: true });

      stage.appendChild(mvEl);

      /* fov 必须用 property 设，不能用 attribute：
         model-viewer 在 auto-fit 时会覆盖 attribute 里的 field-of-view
         （实测设 "24deg" 后 getFieldOfView() 仍返回自动算出的 32），
         而 property setter 能真正生效。必须在 appendChild 之后再设 —— 元素
         连接后 custom element 才完成 upgrade，属性才会被采纳。 */
      mvEl.fieldOfView = FOV;
    }).catch(function () {
      started = false;
    });
  }

  /* 提前 200px 预加载，滚到时基本已就绪 */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { boot(); io.disconnect(); }
      });
    }, { rootMargin: '200px 0px' });
    io.observe(stage);
  } else {
    boot();
  }

  /* 离开视口暂停，回来继续 —— 省电，也让动画总是从「拉出」开始被看到 */
  if ('IntersectionObserver' in window) {
    var vis = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!mvEl) { return; }
        if (en.isIntersecting) { mvEl.play && mvEl.play(); }
        else { mvEl.pause && mvEl.pause(); }
      });
    }, { threshold: 0.15 });
    vis.observe(stage);
  }

  /* 用户在系统层打开「减少动效」时立即停下，不重载 */
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var onChange = function () {
      if (!mvEl) { return; }
      if (mq.matches) { mvEl.pause && mvEl.pause(); }
      else { mvEl.play && mvEl.play(); }
    };
    if (mq.addEventListener) { mq.addEventListener('change', onChange); }
    else if (mq.addListener) { mq.addListener(onChange); }
  }
})();
