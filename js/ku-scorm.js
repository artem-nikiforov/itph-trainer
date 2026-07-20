/* ════════════════════════════════════════════════════════════════════════
   KU · SCORM-РАНТАЙМ КУРСА (SCORM 1.2 — всегда)
   ────────────────────────────────────────────────────────────────────────
   Подключается в КАЖДЫЙ курс/тренажёр вторым скриптом (после kuds.js).
   Агент НЕ пишет SCORM-код — всё уже здесь. Работает и вне LMS
   (localStorage), и внутри (cmi.suspend_data + статусы).

   ЧТО ДЕЛАЕТ АВТОМАТИЧЕСКИ (без единой строчки кода в курсе):
     • находит SCORM 1.2 API в окне LMS и инициализируется на window 'load';
     • сохраняет и восстанавливает прогресс: открытые главы, решённые
       упражнения ([data-ku-id]), значения переменных ([data-ku-var]);
     • двойное хранилище: cmi.suspend_data (в LMS) + localStorage (всегда);
     • один раз ставит lesson_status = incomplete и НИКОГДА не понижает
       уже полученный completed;
     • LMSCommit после каждой записи, LMSFinish при закрытии окна;
     • рендерит сводки [data-ku-report], кнопки копирования/скачивания;
     • завершает курс ТОЛЬКО по кнопке [data-ku-complete].

   ДЕКЛАРАТИВНЫЕ ХУКИ (размечаешь HTML — рантайм подхватывает):

     data-ku-course="id-курса"      на <html> — ключ хранилища (обязательно)
     data-ku-id="упражнение-1"      на упражнении — прогресс решённости;
                                    kuds.js сам вызывает markDone при верном
                                    ответе; восстановление вешает класс .is-done
     data-ku-var="имя"              на input/textarea/select — значение
                                    автосохраняется и восстанавливается
     data-ku-label="Подпись"        на том же поле — человекочитаемая подпись
                                    для сводки (иначе берётся placeholder/имя)
     data-ku-report="all|имя1,имя2" на контейнере — рендер сводки «подпись →
                                    значение» (лист наставнику и т.п.)
     data-ku-report-copy            кнопка «Скопировать сводку»
     data-ku-report-download        кнопка «Скачать сводку» (.txt)
     data-ku-complete               кнопка «Завершить курс» — ЕДИНСТВЕННЫЙ
                                    способ поставить completed

   JS-API (для нестандартных сценариев — см. docs/SCORM.md):
     KU.vars.get(имя) / KU.vars.set(имя, значение) / KU.vars.all()
     KU.progress.markDone(id) / KU.progress.isDone(id)
     KU.progress.setUnlocked(n) / KU.progress.unlocked()
     KU.report.text([имена])   — сводка строкой
     KU.lms.interaction(id, response, result?) — записать ответ в
       cmi.interactions.* (отчёты LMS; поддержка зависит от LMS — Websoft
       проверяй на месте). Вызывай ПОСЛЕ проверки ответа.
     KU.complete()             — завершить (то же, что кнопка)
     KU.save()                 — форс-сохранение (обычно не нужно)

   СОБЫТИЯ (document): 'ku:ready' (состояние восстановлено, detail = state),
     'ku:done' (решено упражнение, detail = id), 'ku:completed'.

   ЛИМИТ: cmi.suspend_data ограничен ~4096 символами. Если состояние не
   влезает (длинные свободные ответы) — в LMS уедет версия с обрезанными
   значениями переменных, а ПОЛНАЯ сохранится в localStorage. Сводка на
   финальном экране всегда собирается из полной версии.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ══ 1. ПОИСК И ОБЁРТКА SCORM 1.2 API ═══════════════════════════════ */
  let api = null;          // объект API из окна LMS
  let lmsReady = false;    // LMSInitialize прошёл успешно

  function findAPI(win) {
    // Стандартный алгоритм SCORM 1.2: поднимаемся по parent-цепочке (≤10),
    // затем пробуем opener. Любая ошибка кросс-домена — просто нет API.
    try {
      let n = 0;
      while (win && n++ < 10) {
        if (win.API) return win.API;
        if (win === win.parent) break;
        win = win.parent;
      }
    } catch (e) { /* нет доступа — значит нет LMS */ }
    return null;
  }
  function lmsInit() {
    api = findAPI(window);
    if (!api && window.opener) api = findAPI(window.opener);
    if (api) {
      try { api.LMSInitialize(""); lmsReady = true; }
      catch (e) { api = null; lmsReady = false; }
    }
  }
  function lmsGet(key) {
    if (!lmsReady) return "";
    try { return String(api.LMSGetValue(key) || ""); } catch (e) { return ""; }
  }
  function lmsSet(key, value) {
    if (!lmsReady) return;
    try { api.LMSSetValue(key, String(value)); } catch (e) {}
  }
  function lmsCommit() {
    if (!lmsReady) return;
    try { api.LMSCommit(""); } catch (e) {}   // без commit LMS может не сохранить
  }
  function lmsFinish() {
    if (!lmsReady) return;
    try { api.LMSFinish(""); } catch (e) {}
    lmsReady = false;
  }

  /* ══ 2. СОСТОЯНИЕ ═══════════════════════════════════════════════════ */
  const COURSE_ID =
    document.documentElement.getAttribute("data-ku-course") || location.pathname;
  const LS_KEY = "ku::" + COURSE_ID;

  const state = {
    unlocked: 1,      // до какой главы открыто (для последовательной навигации)
    done: {},         // { "id-упражнения": true }
    vars: {},         // { "имя": "значение" }
    completed: false, // курс завершён кнопкой
  };

  function serialize(full) {
    // full=true — всё как есть (localStorage);
    // full=false — влезаем в suspend_data: при переполнении режем значения
    // переменных, в крайнем случае шлём без vars (прогресс важнее).
    const snapshot = {
      unlocked: state.unlocked, done: state.done,
      vars: state.vars, completed: state.completed,
    };
    let json = JSON.stringify(snapshot);
    if (full || json.length <= 4000) return json;
    const trimmed = {};
    for (const k in snapshot.vars) {
      const v = String(snapshot.vars[k]);
      trimmed[k] = v.length > 120 ? v.slice(0, 119) + "…" : v;
    }
    json = JSON.stringify({ ...snapshot, vars: trimmed });
    if (json.length <= 4000) return json;
    return JSON.stringify({ ...snapshot, vars: {} });
  }

  let saveTimer = null;
  function save() {
    try { localStorage.setItem(LS_KEY, serialize(true)); } catch (e) {}
    if (lmsReady) {
      lmsSet("cmi.suspend_data", serialize(false));
      // Один раз помечаем попытку начатой. Никогда не понижаем completed.
      const status = lmsGet("cmi.core.lesson_status");
      if (status === "" || status === "not attempted" || status === "unknown") {
        lmsSet("cmi.core.lesson_status", "incomplete");
      }
      lmsCommit();
    }
  }
  function saveSoon() {           // дебаунс для полей ввода
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  function load() {
    let json = "";
    if (lmsReady) json = lmsGet("cmi.suspend_data");
    if (!json) { try { json = localStorage.getItem(LS_KEY) || ""; } catch (e) {} }
    if (json) {
      try {
        const s = JSON.parse(json);
        if (typeof s.unlocked === "number") state.unlocked = Math.max(1, s.unlocked);
        if (s.done && typeof s.done === "object") state.done = s.done;
        if (s.vars && typeof s.vars === "object") state.vars = s.vars;
        state.completed = !!s.completed;
      } catch (e) { /* мусор в хранилище игнорируем */ }
    }
    // localStorage может хранить более полные vars, чем обрезанный suspend_data
    try {
      const local = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (local && local.vars) {
        for (const k in local.vars) {
          const remote = state.vars[k];
          if (!remote || (String(remote).endsWith("…") &&
              String(local.vars[k]).length > String(remote).length)) {
            state.vars[k] = local.vars[k];
          }
        }
      }
    } catch (e) {}
  }

  /* ══ 3. ПЕРЕМЕННЫЕ ([data-ku-var]) ══════════════════════════════════ */
  function fieldValue(el) {
    if (el.type === "checkbox") return el.checked ? (el.value || "да") : "";
    if (el.type === "radio") return el.checked ? el.value : undefined;
    return el.value;
  }
  function bindVars() {
    document.querySelectorAll("[data-ku-var]").forEach((el) => {
      const name = el.getAttribute("data-ku-var");
      // восстановление
      const saved = state.vars[name];
      if (saved !== undefined) {
        if (el.type === "checkbox") el.checked = saved !== "";
        else if (el.type === "radio") { if (el.value === saved) el.checked = true; }
        else el.value = saved;
      }
      // автосохранение
      el.addEventListener("input", onChange);
      el.addEventListener("change", onChange);
      function onChange() {
        const v = fieldValue(el);
        if (v !== undefined) { state.vars[name] = v; saveSoon(); }
      }
    });
  }
  function varLabel(name) {
    const el = document.querySelector('[data-ku-var="' + CSS.escape(name) + '"]');
    if (!el) return name;
    return el.getAttribute("data-ku-label")
        || (el.labels && el.labels[0] && el.labels[0].textContent.trim())
        || el.getAttribute("placeholder")
        || name;
  }

  /* ══ 4. ПРОГРЕСС УПРАЖНЕНИЙ И ГЛАВ ══════════════════════════════════ */
  function decorateDone(id) {
    document.querySelectorAll('[data-ku-id="' + CSS.escape(id) + '"]')
      .forEach((el) => el.classList.add("is-done"));
  }
  const progress = {
    markDone(id) {
      if (!id || state.done[id]) return;
      state.done[id] = true;
      decorateDone(id);
      document.dispatchEvent(new CustomEvent("ku:done", { detail: id }));
      save();
    },
    isDone(id) { return !!state.done[id]; },
    setUnlocked(n) {
      if (n > state.unlocked) { state.unlocked = n; save(); }
    },
    unlocked() { return state.unlocked; },
  };

  /* ══ 5. СВОДКА / «ЛИСТ НАСТАВНИКУ» ══════════════════════════════════ */
  function reportNames(spec) {
    if (!spec || spec === "all") return Object.keys(state.vars);
    return spec.split(",").map((s) => s.trim()).filter(Boolean);
  }
  function reportPairs(names) {
    return names
      .filter((n) => state.vars[n] !== undefined && state.vars[n] !== "")
      .map((n) => ({ label: varLabel(n), value: String(state.vars[n]) }));
  }
  function reportText(names) {
    const title = document.title || COURSE_ID;
    const lines = ["Сводка ответов — " + title, ""];
    reportPairs(names || reportNames("all")).forEach((p) => {
      lines.push(p.label + ":"); lines.push("  " + p.value); lines.push("");
    });
    return lines.join("\n");
  }
  function renderReports() {
    document.querySelectorAll("[data-ku-report]").forEach((box) => {
      const pairs = reportPairs(reportNames(box.getAttribute("data-ku-report")));
      box.innerHTML = pairs.length
        ? pairs.map((p) =>
            '<div class="ku-report__row"><div class="ku-report__label">' +
            escapeHtml(p.label) + '</div><div class="ku-report__value">' +
            escapeHtml(p.value) + "</div></div>").join("")
        : '<p class="ku-report__empty">Ответы пока не заполнены.</p>';
    });
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function bindReportButtons() {
    document.querySelectorAll("[data-ku-report-copy]").forEach((btn) =>
      btn.addEventListener("click", () => {
        navigator.clipboard && navigator.clipboard.writeText(reportText());
        flash(btn, "Скопировано!");
      }));
    document.querySelectorAll("[data-ku-report-download]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const blob = new Blob([reportText()], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = (document.title || "отчёт") + ".txt";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }));
  }
  function flash(btn, text) {
    const old = btn.innerHTML;
    btn.innerHTML = text;
    setTimeout(() => { btn.innerHTML = old; }, 1400);
  }

  /* ══ 6. ЗАВЕРШЕНИЕ — ТОЛЬКО КНОПКОЙ ═════════════════════════════════ */
  function complete() {
    state.completed = true;
    if (lmsReady) {
      lmsSet("cmi.core.lesson_status", "completed");
      lmsCommit();
    }
    save();
    document.querySelectorAll("[data-ku-complete]").forEach((b) => {
      b.classList.add("is-completed");
    });
    document.dispatchEvent(new CustomEvent("ku:completed"));
  }
  function bindComplete() {
    document.querySelectorAll("[data-ku-complete]").forEach((btn) =>
      btn.addEventListener("click", complete));
    if (state.completed) {
      document.querySelectorAll("[data-ku-complete]")
        .forEach((b) => b.classList.add("is-completed"));
    }
  }

  /* ══ 7. ОТЧЁТ В LMS (cmi.interactions — опционально) ════════════════ */
  const lms = {
    interaction(id, response, result) {
      if (!lmsReady) return;
      const i = parseInt(lmsGet("cmi.interactions._count") || "0", 10) || 0;
      lmsSet("cmi.interactions." + i + ".id", id);
      lmsSet("cmi.interactions." + i + ".type", "fill-in");
      lmsSet("cmi.interactions." + i + ".student_response",
             String(response).slice(0, 255));
      if (result) lmsSet("cmi.interactions." + i + ".result", result);
      lmsCommit();
    },
  };

  /* ══ 8. ИНИЦИАЛИЗАЦИЯ ═══════════════════════════════════════════════ */
  // На 'load', не DOMContentLoaded: LMS вставляет API в окно поздно.
  window.addEventListener("load", () => {
    lmsInit();
    load();
    bindVars();
    bindComplete();
    bindReportButtons();
    renderReports();
    Object.keys(state.done).forEach(decorateDone);
    document.dispatchEvent(new CustomEvent("ku:ready", { detail: state }));
    // Сводки должны обновляться по мере ввода
    document.addEventListener("input", (e) => {
      if (e.target && e.target.hasAttribute &&
          e.target.hasAttribute("data-ku-var")) renderReports();
    });
  });
  window.addEventListener("beforeunload", () => { save(); lmsFinish(); });

  /* ══ ЭКСПОРТ ════════════════════════════════════════════════════════ */
  window.KU = {
    vars: {
      get: (n) => state.vars[n],
      set: (n, v) => { state.vars[n] = v; renderReports(); saveSoon(); },
      all: () => ({ ...state.vars }),
    },
    progress,
    report: { text: reportText, render: renderReports },
    lms,
    complete,
    save,
    get state() { return state; },
    get inLMS() { return lmsReady; },
  };
})();
