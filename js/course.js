(function () {
  "use strict";

  const STORAGE_KEY = "ku_itph_trainer_v2";
  const chapters = ["calc", "situations", "finish"];
  const chapterNames = {
    calc: "Посчитать ITPH по периодам",
    situations: "Разобрать ситуации",
    finish: "Забрать алгоритм"
  };
  const situationFeedback = {
    overload: "<strong>Верно.</strong> Высокий ITPH вместе с очередью и отставанием кухни указывает на перегрузку. Поддержи узкое место и скорректируй расстановку.",
    underload: "<strong>Верно.</strong> Нагрузка ниже плана и очереди нет. Перераспредели людей и используй освободившееся время с пользой.",
    quality: "<strong>Верно.</strong> Нормальный ITPH не исключает проблем с качеством. Проверь процесс приготовления, сборки и соблюдение стандартов."
  };
  const originalNavigate = window.kuNavigate;
  let state = loadState();

  function loadState() {
    const fresh = { unlocked: 1, done: [false, false, false], situations: [], completed: false };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return fresh;
      return {
        unlocked: Math.min(Math.max(Number(saved.unlocked) || 1, 1), chapters.length),
        done: chapters.map((_, index) => Boolean(saved.done && saved.done[index])),
        situations: Array.isArray(saved.situations) ? saved.situations.filter(id => situationFeedback[id]) : [],
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

  function logicContains(logic, expected) {
    const numbers = String(logic).match(/\d+(?:[.,]\d+)?/g) || [];
    return numbers.map(parseNumber).some(value => Math.abs(value - expected) < 0.01);
  }

  window.checkPeriodCalculations = function () {
    const rows = [...document.querySelectorAll(".period-row")];
    let correctRows = 0;
    let missingLogic = false;

    rows.forEach(row => {
      const positions = Number(row.dataset.positions);
      const hours = Number(row.dataset.hours);
      const answer = Number(row.dataset.answer);
      const value = parseNumber(row.querySelector(".period-value").value);
      const logic = row.querySelector(".period-logic").value;
      const valueOk = Number.isFinite(value) && Math.abs(value - answer) < 0.01;
      const logicOk = logicContains(logic, positions) && logicContains(logic, hours) && logicContains(logic, answer);
      const rowOk = valueOk && logicOk;

      row.classList.toggle("correct", rowOk);
      row.classList.toggle("incorrect", !rowOk);
      if (!logicOk) missingLogic = true;
      if (rowOk) correctRows += 1;
    });

    if (correctRows === rows.length) {
      showFeedback("calc-feedback", true, "<strong>Все периоды посчитаны верно.</strong> 84 ÷ 3,5 = 24; 112 ÷ 4 = 28; 99 ÷ 3 = 33.");
      markExerciseDone("calc-periods");
      unlockAfter("calc");
    } else {
      const hint = missingLogic
        ? "В каждой отмеченной строке проверь и число, и запись логики: позиции ÷ человеко‑часы = ITPH."
        : "Проверь деление позиций на человеко‑часы в отмеченных строках.";
      showFeedback("calc-feedback", false, "<strong>Есть неточности.</strong> " + hint);
    }
  };

  function restoreSituations() {
    document.querySelectorAll("[data-situation]").forEach(card => {
      const solved = state.situations.includes(card.dataset.situation);
      card.classList.toggle("solved", solved);
      if (!solved) return;
      card.querySelectorAll(".situation-choice").forEach(button => {
        button.disabled = true;
        button.classList.toggle("correct", button.dataset.correct === "1");
      });
    });
    const counter = document.getElementById("situations-count");
    if (counter) counter.textContent = state.situations.length + " / 3";
  }

  function answerSituation(button) {
    const card = button.closest("[data-situation]");
    if (!card || card.classList.contains("solved")) return;
    const id = card.dataset.situation;
    const feedbackId = "situation-" + id + "-feedback";

    if (button.dataset.correct !== "1") {
      button.classList.add("wrong");
      setTimeout(() => button.classList.remove("wrong"), 500);
      showFeedback(feedbackId, false, "<strong>Не совсем.</strong> Сопоставь факт с планом, а затем посмотри, что происходит с командой, опасными зонами и Гостями.");
      return;
    }

    if (!state.situations.includes(id)) state.situations.push(id);
    card.classList.add("solved");
    card.querySelectorAll(".situation-choice").forEach(choice => choice.disabled = true);
    button.classList.add("correct");
    markExerciseDone("situation-" + id);
    showFeedback(feedbackId, true, situationFeedback[id]);
    if (state.situations.length === 3) unlockAfter("situations");
    else {
      saveState();
      syncUi();
    }
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
