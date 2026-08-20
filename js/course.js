(function () {
  "use strict";

  const STORAGE_KEY = "ku_itph_trainer_v2";
  const KU_STORAGE_KEY = "ku::itph-trainer";

  function clearVariableFields() {
    document.querySelectorAll("[data-ku-var]").forEach((field) => {
      if (field.type === "checkbox" || field.type === "radio") field.checked = false;
      else field.value = "";
    });
  }

  function clearCourseStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(KU_STORAGE_KEY);
    } catch (error) {}
  }

  function savedRunIsCompleted() {
    try {
      return [STORAGE_KEY, KU_STORAGE_KEY].some((key) => {
        const saved = JSON.parse(localStorage.getItem(key) || "null");
        return Boolean(saved && saved.completed);
      });
    } catch (error) {
      return false;
    }
  }

  function resetCourseFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") !== "1") return;

    clearCourseStorage();
    clearVariableFields();

    params.delete("reset");
    const query = params.toString();
    const cleanUrl = window.location.pathname + (query ? "?" + query : "") + window.location.hash;
    try { window.history.replaceState(null, "", cleanUrl); } catch (error) {}
  }

  if (savedRunIsCompleted()) {
    clearCourseStorage();
    clearVariableFields();
  }
  resetCourseFromUrl();
  const chapters = ["calc", "situations", "finish"];
  const chapterNames = {
    calc: "Посчитать ITPH по периодам",
    situations: "Разобрать ситуации",
    finish: "Забрать алгоритм"
  };
  const situationFeedback = {
    overload: "Высокий ITPH вместе с очередью и отставанием кухни указывает на перегрузку. Определи западающую зону и скорректируй расстановку.",
    underload: "Нагрузка ниже плана и очереди нет. Перераспредели людей и используй освободившееся время с пользой.",
    quality: "Нормальный ITPH не исключает проблем с качеством. Проверь процесс приготовления, сборки и соблюдение стандартов."
  };
  const originalNavigate = window.kuNavigate;
  let state = loadState();

  function loadState() {
    const fresh = {
      unlocked: 1,
      done: [false, false, false],
      calcRows: [],
      calcRevealed: [],
      calcRowAttempts: {},
      situations: [],
      attempts: {},
      completed: false
    };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return fresh;
      const done = chapters.map((_, index) => Boolean(saved.done && saved.done[index]));
      const savedCalcRows = Array.isArray(saved.calcRows)
        ? [...new Set(saved.calcRows.map(Number).filter(index => index >= 0 && index < 3))]
        : [];
      return {
        unlocked: Math.min(Math.max(Number(saved.unlocked) || 1, 1), chapters.length),
        done,
        calcRows: savedCalcRows.length ? savedCalcRows : (done[0] ? [0, 1, 2] : []),
        calcRevealed: Array.isArray(saved.calcRevealed)
          ? [...new Set(saved.calcRevealed.map(Number).filter(index => index >= 0 && index < 3))]
          : (Number(saved.calcAttempts) >= 3 ? [0, 1, 2] : []),
        calcRowAttempts: Object.fromEntries(
          Object.entries(saved.calcRowAttempts || {})
            .filter(([index]) => ["0", "1", "2"].includes(String(index)))
            .map(([index, count]) => [index, Math.min(Math.max(Number(count) || 0, 0), 3)])
        ),
        situations: Array.isArray(saved.situations) ? saved.situations.filter(id => situationFeedback[id]) : [],
        attempts: Object.fromEntries(
          Object.entries(saved.attempts || {})
            .filter(([id]) => situationFeedback[id])
            .map(([id, count]) => [id, Math.min(Math.max(Number(count) || 0, 0), 3)])
        ),
        completed: Boolean(saved.completed)
      };
    } catch (error) {
      return fresh;
    }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) {}
  }

  function markExerciseDone(id) {
    if (window.KU && window.KU.progress) window.KU.progress.markDone(id);
  }

  function syncUi() {
    chapters.forEach((chapter, index) => {
      const card = document.getElementById("ku-home-card-" + (index + 1));
      if (!card) return;
      card.classList.toggle("locked", index >= state.unlocked);
      card.classList.toggle("done", state.done[index]);
      card.setAttribute("aria-disabled", String(index >= state.unlocked));
    });
    const calcNext = document.getElementById("next-calc");
    const situationsNext = document.getElementById("next-situations");
    if (calcNext) calcNext.disabled = !state.done[0];
    if (situationsNext) situationsNext.disabled = !state.done[1];
    restoreCalculation();
    restoreSituations();
    if (state.completed) showCompleted();
  }

  function unlockAfter(chapter) {
    const index = chapters.indexOf(chapter);
    if (index < 0) return;
    state.done[index] = true;
    state.unlocked = Math.max(state.unlocked, Math.min(index + 2, chapters.length));
    saveState();
    syncUi();
  }

  window.kuNavigate = function (pageId) {
    const index = chapters.indexOf(pageId);
    if (index >= state.unlocked) return;
    originalNavigate(pageId);
    const title = document.getElementById("ku-course-title");
    if (title) title.textContent = chapterNames[pageId] || "";
    syncUi();
  };

  window.startCourse = function () {
    window.kuNavigate("calc");
  };

  function closeButton() {
    return '<button class="feedback-close" type="button" aria-label="Закрыть обратную связь" onclick="closeFeedback(this)"><svg class="ku-ico s"><use href="#i-x"/></svg></button>';
  }

  function showFeedback(id, correct, message) {
    const feedback = document.getElementById(id);
    if (!feedback) return;
    feedback.className = "ku-feedback show " + (correct ? "correct" : "incorrect");
    feedback.innerHTML = '<span class="ku-fb-msg">' + message + "</span>" + closeButton();
  }

  window.closeFeedback = function (button) {
    const feedback = button.closest(".ku-feedback");
    if (feedback) feedback.classList.remove("show");
  };

  function parseNumber(value) {
    return Number(String(value).trim().replace(",", "."));
  }

  function setPeriodFieldsLocked(row, locked) {
    row.querySelector(".period-value").readOnly = locked;
    row.querySelector(".period-logic").readOnly = locked;
  }

  function setSavedFieldValue(field, value) {
    if (field.value === value) return;
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function revealPeriodAnswer(row) {
    setSavedFieldValue(row.querySelector(".period-value"), String(row.dataset.answer));
    setSavedFieldValue(row.querySelector(".period-logic"), row.dataset.model);
    setPeriodFieldsLocked(row, true);
  }

  function restoreCalculation() {
    const rows = [...document.querySelectorAll(".period-row")];
    const currentIndex = rows.findIndex((_, index) => !state.calcRows.includes(index));

    rows.forEach((row, index) => {
      const completed = state.calcRows.includes(index);
      const revealed = state.calcRevealed.includes(index);
      const locked = !completed && index !== currentIndex;

      row.classList.toggle("is-locked", locked);
      row.classList.toggle("correct", completed && !revealed);
      row.classList.toggle("revealed", revealed);
      row.classList.remove("incorrect");
      setPeriodFieldsLocked(row, completed || locked);
      if (revealed) revealPeriodAnswer(row);
    });

    const counter = document.getElementById("calc-period-count");
    if (counter) counter.textContent = state.calcRows.length + " / 3";
    const checkButton = document.getElementById("check-calc");
    if (checkButton) {
      checkButton.disabled = currentIndex < 0;
      checkButton.textContent = currentIndex < 0 ? "Все периоды разобраны" : "Проверить период";
    }
  }

  function resolvePeriod(row, index, revealed) {
    if (!state.calcRows.includes(index)) state.calcRows.push(index);
    state.calcRows.sort((a, b) => a - b);
    if (revealed && !state.calcRevealed.includes(index)) state.calcRevealed.push(index);
    setPeriodFieldsLocked(row, true);
    const allDone = state.calcRows.length === 3;
    if (allDone) {
      markExerciseDone("calc-periods");
      unlockAfter("calc");
    } else {
      saveState();
      syncUi();
    }
    return allDone;
  }

  window.checkPeriodCalculations = function () {
    const rows = [...document.querySelectorAll(".period-row")];
    const currentIndex = rows.findIndex((_, index) => !state.calcRows.includes(index));
    if (currentIndex < 0) return;

    const row = rows[currentIndex];
    const answer = Number(row.dataset.answer);
    const value = parseNumber(row.querySelector(".period-value").value);
    const decision = row.querySelector(".period-logic").value.trim();
    const valueOk = Number.isFinite(value) && Math.abs(value - answer) < 0.01;
    const decisionReady = decision.length >= 20;

    row.classList.toggle("correct", valueOk && decisionReady);
    row.classList.toggle("incorrect", !valueOk || !decisionReady);

    if (valueOk && decisionReady) {
      const allDone = resolvePeriod(row, currentIndex, false);
      showFeedback(
        "calc-feedback",
        true,
        allDone
          ? "<strong>Все три периода разобраны.</strong> Можно переходить к ситуациям."
          : "<strong>Верно.</strong> Сравни свой вывод с ориентиром в строке. Следующий период открыт."
      );
      return;
    }

    const attemptKey = String(currentIndex);
    const attempts = Math.min((Number(state.calcRowAttempts[attemptKey]) || 0) + 1, 3);
    state.calcRowAttempts[attemptKey] = attempts;
    saveState();

    if (attempts >= 3) {
      const allDone = resolvePeriod(row, currentIndex, true);
      showFeedback(
        "calc-feedback",
        true,
        "<strong>Разбор после трёх попыток.</strong> " + row.dataset.setup + " = " + row.dataset.answer + ". Эталонный расчёт и решение подставлены в поля. " + (allDone ? "Можно переходить к ситуациям." : "Следующий период открыт.")
      );
      return;
    }

    const hints = [];
    if (!valueOk) {
      hints.push(
        attempts === 1
          ? "Формула: проданные блюда ÷ часы сотрудников за период = ITPH."
          : "Подставь данные так: " + row.dataset.setup + ". Затем выполни деление."
      );
    }
    if (!decisionReady) {
      hints.push("Допиши, что результат значит относительно плана и какое действие предпримешь первым.");
    }
    const remaining = 3 - attempts;
    const attemptsText = remaining === 1 ? "Осталась 1 попытка." : "Осталось " + remaining + " попытки.";
    showFeedback("calc-feedback", false, "<strong>Есть неточности.</strong> " + hints.join(" ") + " " + attemptsText);
  };  function restoreSituations() {
    const cards = [...document.querySelectorAll("[data-situation]")];
    const currentIndex = cards.findIndex(card => !state.situations.includes(card.dataset.situation));

    cards.forEach((card, index) => {
      const solved = state.situations.includes(card.dataset.situation);
      const locked = !solved && index !== currentIndex;
      card.classList.toggle("solved", solved);
      card.classList.toggle("is-locked", locked);
      card.querySelectorAll(".situation-choice").forEach(button => {
        button.disabled = solved || locked;
        button.classList.toggle("correct", solved && button.dataset.correct === "1");
      });
    });
    const counter = document.getElementById("situations-count");
    if (counter) counter.textContent = state.situations.length + " / 3";
  }
  function resolveSituation(card, id, feedbackId, message) {
    if (!state.situations.includes(id)) state.situations.push(id);
    card.classList.add("solved");
    card.querySelectorAll(".situation-choice").forEach(choice => {
      choice.disabled = true;
      choice.classList.toggle("correct", choice.dataset.correct === "1");
    });
    markExerciseDone("situation-" + id);
    showFeedback(feedbackId, true, message);
    if (state.situations.length === 3) unlockAfter("situations");
    else {
      saveState();
      syncUi();
    }
  }

  function answerSituation(button) {
    const card = button.closest("[data-situation]");
    if (!card || card.classList.contains("solved")) return;
    const id = card.dataset.situation;
    const feedbackId = "situation-" + id + "-feedback";

    if (button.dataset.correct !== "1") {
      const attempts = Math.min((Number(state.attempts[id]) || 0) + 1, 3);
      state.attempts[id] = attempts;
      saveState();
      button.classList.add("wrong");
      setTimeout(() => button.classList.remove("wrong"), 500);

      if (attempts >= 3) {
        resolveSituation(
          card,
          id,
          feedbackId,
          "<strong>Разбор после трёх попыток.</strong> " + situationFeedback[id] + " Правильный вариант отмечен — можно идти дальше."
        );
        return;
      }

      const remaining = 3 - attempts;
      const attemptsText = remaining === 1 ? "Осталась 1 попытка." : "Осталось " + remaining + " попытки.";
      showFeedback(
        feedbackId,
        false,
        "<strong>Не совсем.</strong> Сопоставь факт с планом, а затем посмотри, что происходит с командой, опасными зонами и Гостями. " + attemptsText
      );
      return;
    }

    resolveSituation(card, id, feedbackId, "<strong>Верно.</strong> " + situationFeedback[id]);
  }
  function showCompleted() {
    const button = document.getElementById("complete-course");
    const message = document.getElementById("complete-state");
    if (button) {
      button.disabled = true;
      button.textContent = "Курс завершён";
    }
    if (message) message.classList.add("show");
  }

  window.completeCourse = function () {
    state.done[2] = true;
    state.completed = true;
    saveState();
    syncUi();
  };

  function resetCompletedRunFromScorm(event) {
    const runtimeState = event.detail;
    if (!runtimeState || !runtimeState.completed) return;

    runtimeState.unlocked = 1;
    runtimeState.done = {};
    runtimeState.vars = {};
    runtimeState.completed = false;
    clearCourseStorage();
    clearVariableFields();
    document.querySelectorAll("[data-ku-id]").forEach((exercise) => {
      exercise.classList.remove("is-done");
    });
    document.querySelectorAll("[data-ku-complete]").forEach((button) => {
      button.classList.remove("is-completed");
    });

    state = loadState();
    if (window.KU && window.KU.save) window.KU.save();
    syncUi();
  }

  document.addEventListener("ku:ready", resetCompletedRunFromScorm);

  function closeCourseWindow() {
    window.setTimeout(function () {
      let target = window;
      try {
        if (window.top && window.top !== window) target = window.top;
        target.close();
      } catch (error) {
        try { window.close(); } catch (closeError) {}
      }

      window.setTimeout(function () {
        try {
          if (target.closed) return;
        } catch (error) {}
        const message = document.getElementById("complete-state");
        if (message) {
          message.textContent = "Курс завершён. Теперь можно закрыть это окно.";
          message.classList.add("show");
        }
      }, 500);
    }, 350);
  }

  document.addEventListener("ku:completed", closeCourseWindow);

  document.addEventListener("click", function (event) {
    const choice = event.target.closest(".situation-choice");
    if (choice && !choice.disabled) answerSituation(choice);
  });

  document.addEventListener("DOMContentLoaded", function () {
    window.kuSetAudience("ms");
    window.kuSetDirection("lyudi");
    window.kuSetTheme("light");
    syncUi();
  });
})();
