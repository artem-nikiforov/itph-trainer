/* ════════════════════════════════════════════════════════════════════════
   KU · ИНТЕРАКТИВНОСТЬ ДИЗАЙН-СИСТЕМЫ
   ────────────────────────────────────────────────────────────────────────
   Чистый ванильный JS без зависимостей. Портировано и переработано из
   reusable/elearning-kit.js. Самоинициализируется на DOMContentLoaded и
   при делегировании событий работает даже с динамически показанными блоками.

   СОДЕРЖАНИЕ
     1. Подраздел (ЦА) — «переодевание» всего проекта
     2. Тема (светлая/тёмная)
     3. Появление по скроллу + запуск инфографики
     4. Аккордеон
     5. Сортировка списка (мышь + тач)
     6. Drag-and-drop по зонам (мышь + тач)
     7. Тест / выбор варианта
     8. Галерея
     9. Модалка
    10. Мини-роутер глав (демо SPA) + прогресс + разблокировка
    11. Утилиты + инициализация
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ══ 1. ПОДРАЗДЕЛ (ЦА) + НАПРАВЛЕНИЕ ════════════════════════════════
     Два атрибута в корне — весь проект «переодевается» через CSS:
       data-audience  → трек (шрифт + база)
       data-direction → направление внутри трека (цвета)
     Выбор сохраняется в localStorage. Заблокированные ЦА игнорируются.
     Для МС тёмная тема отключается (переключатель прячется). */
  const AUDIENCE_KEY = "ku-audience";
  const DIRECTION_KEY = "ku-direction";
  const MS_DEFAULT_DIR = "inzh";

  function setAudience(id, btn) {
    if (btn && btn.hasAttribute("disabled")) return;
    const root = document.documentElement;
    root.setAttribute("data-audience", id);
    try { localStorage.setItem(AUDIENCE_KEY, id); } catch (e) {}
    document.querySelectorAll("[data-audience-btn]").forEach(b =>
      b.classList.toggle("is-active", b.getAttribute("data-audience-btn") === id));

    if (id === "ms") {
      // у МС цвета зависят от направления; тёмной темы нет
      let dir = MS_DEFAULT_DIR;
      try { dir = localStorage.getItem(DIRECTION_KEY) || MS_DEFAULT_DIR; } catch (e) {}
      setDirection(dir);
      setTheme("light");
      setThemeToggleEnabled(false);
    } else {
      root.removeAttribute("data-direction");
      setThemeToggleEnabled(true);
    }
  }

  function setDirection(dir) {
    document.documentElement.setAttribute("data-direction", dir);
    try { localStorage.setItem(DIRECTION_KEY, dir); } catch (e) {}
    document.querySelectorAll("[data-direction-btn]").forEach(b =>
      b.classList.toggle("is-active", b.getAttribute("data-direction-btn") === dir));
  }

  function initAudience() {
    let saved = "bk-base";
    try { saved = localStorage.getItem(AUDIENCE_KEY) || "bk-base"; } catch (e) {}
    const btn = document.querySelector('[data-audience-btn="' + saved + '"]');
    setAudience(btn && !btn.hasAttribute("disabled") ? saved : "bk-base");
    document.querySelectorAll("[data-audience-btn]").forEach(b =>
      b.addEventListener("click", () => setAudience(b.getAttribute("data-audience-btn"), b)));
    document.querySelectorAll("[data-direction-btn]").forEach(b =>
      b.addEventListener("click", () => setDirection(b.getAttribute("data-direction-btn"))));
  }

  /* ══ 2. ТЕМА (светлая/тёмная) ═══════════════════════════════════════
     МС светится только в светлой теме — переключатель для него скрыт. */
  const THEME_KEY = "ku-theme";
  function setTheme(mode) {
    document.documentElement.setAttribute("data-theme", mode);
    try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
    document.querySelectorAll("[data-theme-toggle]").forEach(b =>
      b.setAttribute("aria-pressed", String(mode === "dark")));
  }
  function setThemeToggleEnabled(on) {
    document.querySelectorAll("[data-theme-toggle]").forEach(b => {
      b.toggleAttribute("hidden", !on);
      b.disabled = !on;
    });
  }
  function initTheme() {
    let mode = null;
    try { mode = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (!mode) mode = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    // при старте в МС тема всегда светлая (выставится в setAudience)
    setTheme(document.documentElement.getAttribute("data-audience") === "ms" ? "light" : mode);
    document.querySelectorAll("[data-theme-toggle]").forEach(b =>
      b.addEventListener("click", () =>
        setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark")));
  }

  /* ══ 2b. КАРТИНКА ОБЛОЖКИ (опциональная) ════════════════════════════
     Слот <img data-ku-hero hidden> на обложке. Пробуем по очереди
     assets/hero.{webp,png,jpg,jpeg,svg}: нашлась — показываем, ни одной
     нет — удаляем слот целиком (обложка живёт и без картинки).
     Другой путь можно задать значением атрибута: data-ku-hero="assets/cover". */
  function initHeroImage() {
    document.querySelectorAll("img[data-ku-hero]").forEach(img => {
      const base = img.getAttribute("data-ku-hero") || "assets/hero";
      const exts = ["webp", "png", "jpg", "jpeg", "svg"];
      let i = 0;
      img.addEventListener("load", () => img.removeAttribute("hidden"));
      img.addEventListener("error", tryNext);
      function tryNext() {
        if (i >= exts.length) { img.remove(); return; } // картинки нет — слота нет
        img.src = base + "." + exts[i++];
      }
      tryNext();
    });
  }

  /* ══ 3. ПОЯВЛЕНИЕ ПО СКРОЛЛУ + ИНФОГРАФИКА ══════════════════════════
     Любой .ku-reveal / .ku-bars / .ku-ring / .ku-stat / .ku-timeline
     получает .visible при входе во вьюпорт (инфографика тогда анимируется). */
  const REVEAL_SEL = ".ku-reveal, .ku-bars, .ku-ring, .ku-stat, .ku-timeline";
  let revealObserver = null;
  function initReveal(root) {
    root = root || document;
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add("visible"); revealObserver.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    }
    root.querySelectorAll(REVEAL_SEL).forEach(el => {
      if (el.classList.contains("visible")) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add("visible"); // уже видно
      else revealObserver.observe(el);
    });
  }

  /* ══ 4. АККОРДЕОН ═══════════════════════════════════════════════════
     Делегирование: клик по .ku-acc-q переключает .open на кнопке и теле. */
  function initAccordion() {
    document.addEventListener("click", (e) => {
      const q = e.target.closest(".ku-acc-q");
      if (!q) return;
      const body = q.nextElementSibling;
      const open = q.classList.toggle("open");
      if (body) body.classList.toggle("open", open);
    });
  }

  /* ══ 5. СОРТИРОВКА СПИСКА ═══════════════════════════════════════════ */
  function initSortable(list) {
    if (!list || list.dataset.kuBound) return;
    list.dataset.kuBound = "1";
    let dragEl = null;

    list.querySelectorAll(".ku-sort-item").forEach(item => {
      item.setAttribute("draggable", "true");
      item.addEventListener("dragstart", () => { dragEl = item; setTimeout(() => item.classList.add("dragging"), 0); });
      item.addEventListener("dragend", () => { item.classList.remove("dragging"); clearMarks(); dragEl = null; });
      // тач
      item.addEventListener("touchstart", () => { dragEl = item; item.classList.add("dragging"); }, { passive: true });
      item.addEventListener("touchmove", (e) => mark(e.touches[0].clientY), { passive: true });
      item.addEventListener("touchend", (e) => {
        if (!dragEl) return;
        const t = target(e.changedTouches[0].clientY);
        if (t.el) t.before ? list.insertBefore(dragEl, t.el) : t.el.insertAdjacentElement("afterend", dragEl);
        dragEl.classList.remove("dragging"); clearMarks(); dragEl = null;
      });
    });
    list.addEventListener("dragover", (e) => {
      e.preventDefault(); if (!dragEl) return;
      const after = afterEl(e.clientY); clearMarks();
      if (after) after.classList.add("drag-over-top");
      else { const last = list.querySelector(".ku-sort-item:last-child"); if (last && last !== dragEl) last.classList.add("drag-over-bottom"); }
    });
    list.addEventListener("drop", (e) => {
      e.preventDefault(); if (!dragEl) return;
      const after = afterEl(e.clientY);
      after ? list.insertBefore(dragEl, after) : list.appendChild(dragEl);
    });

    function afterEl(y) {
      const items = [...list.querySelectorAll(".ku-sort-item:not(.dragging)")];
      return items.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset, el: child };
        return closest;
      }, { offset: -Infinity, el: null }).el;
    }
    function target(y) {
      const els = [...list.querySelectorAll(".ku-sort-item:not(.dragging)")];
      let el = null, before = true;
      for (const e of els) { const r = e.getBoundingClientRect(); if (y < r.top + r.height / 2) { el = e; before = true; break; } el = e; before = false; }
      return { el, before };
    }
    function mark(y) { const t = target(y); clearMarks(); if (t.el) t.el.classList.add(t.before ? "drag-over-top" : "drag-over-bottom"); }
    function clearMarks() { list.querySelectorAll(".ku-sort-item").forEach(i => i.classList.remove("drag-over-top", "drag-over-bottom")); }
  }

  // Проверка порядка сортировки против эталона (data-correct на списке — "1,3,0,2")
  window.kuCheckSort = function (listId, feedbackId) {
    const list = document.getElementById(listId);
    const correct = (list.dataset.correct || "").split(",").map(Number);
    const cur = [...list.querySelectorAll(".ku-sort-item")].map(el => parseInt(el.dataset.idx, 10));
    showFeedback(feedbackId, correct.every((v, i) => v === cur[i]));
  };

  /* ══ 6. DRAG-AND-DROP ПО ЗОНАМ ══════════════════════════════════════ */
  function initZones(scope) {
    scope.querySelectorAll("[data-ku-dnd]").forEach(root => {
      if (root.dataset.kuBound) return;
      root.dataset.kuBound = "1";
      const zones = [...root.querySelectorAll(".ku-pool, .ku-zone__drop")];
      root.querySelectorAll(".ku-chip").forEach(chip => bindChip(chip, zones));
      zones.forEach(zone => {
        zone.addEventListener("dragover", (e) => { e.preventDefault(); dropTarget(zone).classList.add("drag-over"); });
        zone.addEventListener("dragleave", () => dropTarget(zone).classList.remove("drag-over"));
        zone.addEventListener("drop", (e) => {
          e.preventDefault(); dropTarget(zone).classList.remove("drag-over");
          const chip = document.getElementById(e.dataTransfer.getData("text/plain"));
          if (chip) zone.appendChild(chip);
        });
      });
    });
    function dropTarget(zone) { return zone.classList.contains("ku-zone__drop") ? zone.closest(".ku-zone") : zone; }
    function bindChip(chip, zones) {
      chip.setAttribute("draggable", "true");
      chip.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", chip.id); chip.classList.add("dragging"); });
      chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
      // тач: клон летит за пальцем
      let clone = null;
      chip.addEventListener("touchstart", () => {
        chip.classList.add("dragging");
        clone = chip.cloneNode(true);
        clone.style.cssText = "position:fixed;pointer-events:none;opacity:0.8;z-index:9999;margin:0;";
        document.body.appendChild(clone);
      }, { passive: true });
      chip.addEventListener("touchmove", (e) => {
        const t = e.touches[0];
        if (clone) { clone.style.left = (t.clientX - 30) + "px"; clone.style.top = (t.clientY - 18) + "px"; }
        zones.forEach(z => { const box = (z.closest(".ku-zone") || z); box.classList.toggle("drag-over", inRect(t, z.getBoundingClientRect())); });
      }, { passive: true });
      chip.addEventListener("touchend", (e) => {
        chip.classList.remove("dragging");
        if (clone) { clone.remove(); clone = null; }
        const t = e.changedTouches[0];
        zones.forEach(z => { (z.closest(".ku-zone") || z).classList.remove("drag-over"); if (inRect(t, z.getBoundingClientRect())) z.appendChild(chip); });
      });
    }
  }
  function inRect(p, r) { return p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom; }

  // Проверка распределения по двум зонам. correct = { zone1Id:[keys], zone2Id:[keys] }
  window.kuCheckZones = function (zone1Id, keys1, zone2Id, keys2, feedbackId) {
    const keys = id => [...document.getElementById(id).querySelectorAll(".ku-chip")].map(c => c.dataset.key);
    const ok = setEq(keys(zone1Id), keys1) && setEq(keys(zone2Id), keys2);
    showFeedback(feedbackId, ok);
  };

  /* ══ 7. ТЕСТ / ВЫБОР ВАРИАНТА ═══════════════════════════════════════
     Кнопка .ku-choice с data-correct="1|0". Верная — зелёная, неверная «мигает».
     Когда все вопросы группы решены — общий фидбэк. */
  function initQuiz() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".ku-choice");
      if (!btn || btn.disabled) return;
      const q = btn.closest(".ku-quiz-q");
      if (q && q.classList.contains("solved")) return;
      if (btn.dataset.correct === "1") {
        btn.classList.add("correct");
        if (q) {
          q.classList.add("solved");
          q.querySelectorAll(".ku-choice").forEach(b => b.disabled = true);
          const group = q.closest("[data-quiz-group]");
          if (group && [...group.querySelectorAll(".ku-quiz-q")].every(x => x.classList.contains("solved"))) {
            showFeedback(group.dataset.quizGroup, true);
          }
        }
      } else {
        btn.classList.add("wrong");
        setTimeout(() => btn.classList.remove("wrong"), 500);
      }
    });
  }

  /* ══ 8. ГАЛЕРЕЯ ═════════════════════════════════════════════════════ */
  function initGalleries() {
    document.querySelectorAll("[data-ku-gallery]").forEach(g => {
      const track = g.querySelector(".ku-gallery__track");
      const slides = track ? track.children.length : 0;
      const dotsWrap = g.querySelector(".ku-gallery__dots");
      let idx = 0;
      if (dotsWrap) {
        dotsWrap.innerHTML = "";
        for (let i = 0; i < slides; i++) {
          const d = document.createElement("button");
          d.className = "ku-gallery__dot" + (i === 0 ? " active" : "");
          d.setAttribute("aria-label", "Слайд " + (i + 1));
          d.addEventListener("click", () => { idx = i; render(); });
          dotsWrap.appendChild(d);
        }
      }
      g.querySelectorAll("[data-ku-gallery-prev]").forEach(b => b.addEventListener("click", () => { idx = (idx - 1 + slides) % slides; render(); }));
      g.querySelectorAll("[data-ku-gallery-next]").forEach(b => b.addEventListener("click", () => { idx = (idx + 1) % slides; render(); }));
      function render() {
        if (track) track.style.transform = "translateX(-" + idx * 100 + "%)";
        if (dotsWrap) [...dotsWrap.children].forEach((d, i) => d.classList.toggle("active", i === idx));
      }
    });
  }

  /* ══ 9. МОДАЛКА ═════════════════════════════════════════════════════ */
  window.kuOpenModal = function (id) { const m = document.getElementById(id); if (m) m.classList.add("open"); };
  window.kuCloseModal = function (id) {
    const m = id ? document.getElementById(id) : document.querySelector(".ku-modal-overlay.open");
    if (m) m.classList.remove("open");
  };
  function initModal() {
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("ku-modal-overlay")) e.target.classList.remove("open");
      const c = e.target.closest("[data-ku-modal-close]");
      if (c) window.kuCloseModal();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") window.kuCloseModal(); });
  }

  /* ══ 10. МИНИ-РОУТЕР ГЛАВ (демо SPA) ════════════════════════════════
     Демонстрация паттерна reusable: .ku-page переключаются, прогресс и
     последовательная разблокировка глав (#ku-home-card-N). */
  const KU = { pages: [], order: [], names: {}, unlocked: 1 };
  window.kuNavigate = function (pageId) {
    const target = document.getElementById("ku-page-" + pageId);
    if (!target) return;
    KU.pages.forEach(id => document.getElementById("ku-page-" + id)?.classList.remove("active"));
    target.classList.add("active");
    const scroller = document.querySelector("[data-ku-course]");
    if (scroller) scroller.scrollIntoView({ behavior: "smooth", block: "start" });

    const idx = KU.order.indexOf(pageId);
    const titleEl = document.getElementById("ku-course-title");
    const countEl = document.getElementById("ku-course-count");
    const barEl = document.getElementById("ku-course-bar");
    if (titleEl) titleEl.textContent = KU.names[pageId] || "";
    if (idx !== -1) {
      if (countEl) countEl.textContent = (idx + 1) + " / " + KU.order.length;
      if (barEl) barEl.style.width = Math.round(((idx + 1) / KU.order.length) * 100) + "%";
      const next = Math.min(idx + 2, KU.order.length);
      if (next > KU.unlocked) KU.unlocked = next;
      applyLocks();
    } else {
      if (countEl) countEl.textContent = "";
      if (barEl) barEl.style.width = "0%";
    }
    setTimeout(() => initReveal(target), 40);
  };
  function applyLocks() {
    KU.order.forEach((ch, i) => {
      const card = document.getElementById("ku-home-card-" + (i + 1));
      if (card) card.classList.toggle("locked", i >= KU.unlocked);
    });
  }
  function initCourse() {
    const course = document.querySelector("[data-ku-course]");
    if (!course) return;
    KU.order = (course.dataset.chapters || "").split(",").filter(Boolean);
    KU.pages = ["home"].concat(KU.order);
    KU.order.forEach((id, i) => KU.names[id] = "Глава " + (i + 1));
    KU.names.home = "";
    applyLocks();
  }

  /* ══ 11. УТИЛИТЫ + ИНИЦИАЛИЗАЦИЯ ════════════════════════════════════ */
  function setEq(a, b) { return a.length === b.length && a.every(v => b.includes(v)); }
  function showFeedback(id, ok, okText, badText) {
    const fb = document.getElementById(id);
    if (!fb) return;
    fb.className = "ku-feedback show " + (ok ? "correct" : "incorrect");
    const msg = ok ? (okText || "<strong>Верно!</strong> Так и есть.")
                   : (badText || "<strong>Не совсем.</strong> Попробуй ещё раз.");
    // сохраняем иконку, если она задана в разметке через data-*, иначе просто текст
    fb.innerHTML = '<span class="ku-fb-msg">' + msg + "</span>";
  }
  window.kuShuffle = function (el) {
    if (!el) return;
    const kids = [...el.children];
    for (let i = kids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kids[i], kids[j]] = [kids[j], kids[i]]; }
    kids.forEach(k => el.appendChild(k));
  };

  window.kuSetAudience = setAudience;
  window.kuSetDirection = setDirection;
  window.kuSetTheme = setTheme;

  document.addEventListener("DOMContentLoaded", () => {
    initAudience();
    initTheme();
    initHeroImage();
    initAccordion();
    initQuiz();
    initModal();
    initGalleries();
    initCourse();
    document.querySelectorAll(".ku-sortable").forEach(initSortable);
    initZones(document);
    initReveal(document);
  });
})();
