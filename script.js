/* =========================================================
   CHM 102 Interactive Quiz Simulator
   ========================================================= */

const TIME_LIMIT_SECONDS = 40 * 60; // 40 minutes
const PASS_THRESHOLD_PCT = 50; // pass/fail cutoff

let QUESTION_BANK = [];       // raw bank loaded from questions.json
let quizQuestions = [];       // working copy (possibly shuffled, with option order)
let answers = {};             // { questionIndex: "A"|"B"|"C"|"D" }
let currentIndex = 0;
let timeRemaining = TIME_LIMIT_SECONDS;
let timerInterval = null;
let studentName = "";
let quizSubmitted = false;
let startTimestamp = null;

/* ---------------- boot ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  buildLattice();
  loadQuestions();
  bindWelcomeEvents();
  bindQuizEvents();
  bindReviewEvents();
  bindResultsEvents();
  bindConfirmDialog();
});

async function loadQuestions() {
  try {
    const res = await fetch("questions.json");
    QUESTION_BANK = await res.json();
  } catch (e) {
    console.error("Could not load questions.json", e);
  }
}

/* ---------------- ambient lattice background ---------------- */
function buildLattice() {
  const group = document.getElementById("latticeGroup");
  if (!group) return;
  const ns = "http://www.w3.org/2000/svg";
  const rows = 6, cols = 8;
  const hexR = 9;
  const dx = hexR * 1.8;
  const dy = hexR * 1.55;
  let svgHTML = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * dx + (r % 2 ? dx / 2 : 0) + 5;
      const cy = r * dy + 5;
      if (cx > 105 || cy > 105) continue;
      const pts = hexPoints(cx, cy, hexR * 0.55);
      svgHTML += `<polygon points="${pts}" fill="none" stroke="#16222D" stroke-width="0.18" opacity="0.5"/>`;
    }
  }
  group.innerHTML = svgHTML;
}
function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/* ---------------- welcome screen ---------------- */
function bindWelcomeEvents() {
  document.getElementById("startQuizBtn").addEventListener("click", startQuiz);
}

function startQuiz() {
  if (!QUESTION_BANK.length) {
    alert("Questions are still loading — please try again in a moment.");
    return;
  }
  studentName = document.getElementById("studentName").value.trim();
  const shuffleQ = document.getElementById("randomizeQuestions").checked;
  const shuffleO = document.getElementById("randomizeOptions").checked;

  quizQuestions = QUESTION_BANK.map(q => {
    let letters = ["A", "B", "C", "D"];
    let optionMap = { A: q.options.A, B: q.options.B, C: q.options.C, D: q.options.D };
    let correctLetter = q.correct;

    if (shuffleO) {
      const entries = letters.map(l => ({ text: q.options[l], wasCorrect: l === q.correct, notes: q.notes[l] }));
      shuffleArray(entries);
      optionMap = {};
      let newNotes = {};
      entries.forEach((entry, idx) => {
        const newLetter = letters[idx];
        optionMap[newLetter] = entry.text;
        newNotes[newLetter] = entry.notes;
        if (entry.wasCorrect) correctLetter = newLetter;
      });
      return { ...q, options: optionMap, correct: correctLetter, notes: newNotes };
    }
    return { ...q };
  });

  if (shuffleQ) shuffleArray(quizQuestions);

  answers = {};
  currentIndex = 0;
  timeRemaining = TIME_LIMIT_SECONDS;
  quizSubmitted = false;
  startTimestamp = Date.now();

  document.getElementById("headerStudentName").textContent = studentName ? `· ${studentName}` : "";

  buildPalette();
  showScreen("screen-quiz");
  renderQuestion();
  startTimer();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ---------------- screen switching ---------------- */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ---------------- timer ---------------- */
function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      submitQuiz(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(Math.max(timeRemaining, 0) / 60);
  const s = Math.max(timeRemaining, 0) % 60;
  document.getElementById("timerText").textContent = `${m}:${s.toString().padStart(2, "0")}`;

  const ring = document.getElementById("timerRing");
  const circumference = 150.8;
  const frac = Math.max(timeRemaining, 0) / TIME_LIMIT_SECONDS;
  ring.style.strokeDashoffset = (circumference * (1 - frac)).toFixed(1);

  const wrap = document.getElementById("timerWrap");
  wrap.classList.remove("warn", "danger");
  if (timeRemaining <= 60) wrap.classList.add("danger");
  else if (timeRemaining <= 300) wrap.classList.add("warn");
}

/* ---------------- palette ---------------- */
function buildPalette() {
  const grid = document.getElementById("paletteGrid");
  grid.innerHTML = "";
  quizQuestions.forEach((q, i) => {
    const btn = document.createElement("button");
    btn.className = "palette-cell";
    btn.textContent = i + 1;
    btn.addEventListener("click", () => { currentIndex = i; renderQuestion(); });
    grid.appendChild(btn);
  });
  refreshPalette();
}

function refreshPalette() {
  const cells = document.querySelectorAll(".palette-cell");
  cells.forEach((cell, i) => {
    cell.classList.toggle("answered", answers[i] !== undefined);
    cell.classList.toggle("current", i === currentIndex);
  });
  const answeredCount = Object.keys(answers).length;
  document.getElementById("progressBarFill").style.width = `${(answeredCount / quizQuestions.length) * 100}%`;
}

/* ---------------- question rendering ---------------- */
function bindQuizEvents() {
  document.getElementById("prevBtn").addEventListener("click", () => {
    if (currentIndex > 0) { currentIndex--; renderQuestion(); }
  });
  document.getElementById("nextBtn").addEventListener("click", () => {
    if (currentIndex < quizQuestions.length - 1) { currentIndex++; renderQuestion(); }
    else { openReview(); }
  });
  document.getElementById("submitBtn").addEventListener("click", () => openConfirm());
  document.getElementById("reviewBtn").addEventListener("click", openReview);
}

function renderQuestion() {
  const q = quizQuestions[currentIndex];
  document.getElementById("qTopic").textContent = q.topic;
  document.getElementById("qCounter").textContent = `Question ${currentIndex + 1} of ${quizQuestions.length}`;
  document.getElementById("qText").textContent = q.question;

  const list = document.getElementById("optionsList");
  list.innerHTML = "";
  ["A", "B", "C", "D"].forEach(letter => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    if (answers[currentIndex] === letter) btn.classList.add("selected");
    btn.innerHTML = `<span class="option-letter">${letter}</span><span>${escapeHTML(q.options[letter])}</span>`;
    btn.addEventListener("click", () => {
      answers[currentIndex] = letter;
      renderQuestion();
      refreshPalette();
    });
    list.appendChild(btn);
  });

  document.getElementById("prevBtn").disabled = currentIndex === 0;
  document.getElementById("nextBtn").textContent = currentIndex === quizQuestions.length - 1 ? "Review Answers →" : "Next →";

  refreshPalette();
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------- review screen (pre-submit) ---------------- */
function bindReviewEvents() {
  document.getElementById("backToQuizBtn").addEventListener("click", () => showScreen("screen-quiz"));
  document.getElementById("finalSubmitBtn").addEventListener("click", () => openConfirm());
}

function openReview() {
  const grid = document.getElementById("reviewGrid");
  grid.innerHTML = "";
  quizQuestions.forEach((q, i) => {
    const cell = document.createElement("button");
    const isAnswered = answers[i] !== undefined;
    cell.className = `review-cell ${isAnswered ? "answered" : "unanswered"}`;
    cell.innerHTML = `<span class="num">Q${i + 1}</span><span class="status">${isAnswered ? "Answered" : "Skipped"}</span>`;
    cell.addEventListener("click", () => { currentIndex = i; showScreen("screen-quiz"); renderQuestion(); });
    grid.appendChild(cell);
  });
  showScreen("screen-review");
}

/* ---------------- confirm submit dialog ---------------- */
function bindConfirmDialog() {
  document.getElementById("confirmCancel").addEventListener("click", closeConfirm);
  document.getElementById("confirmOk").addEventListener("click", () => {
    closeConfirm();
    submitQuiz(false);
  });
}

function openConfirm() {
  const unanswered = quizQuestions.length - Object.keys(answers).length;
  document.getElementById("confirmBody").textContent = unanswered > 0
    ? `You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Once submitted, you can't change your answers.`
    : `You've answered every question. Once submitted, you can't change your answers.`;
  document.getElementById("confirmOverlay").classList.add("active");
}
function closeConfirm() {
  document.getElementById("confirmOverlay").classList.remove("active");
}

/* ---------------- submission & scoring ---------------- */
function submitQuiz(autoSubmitted) {
  if (quizSubmitted) return;
  quizSubmitted = true;
  clearInterval(timerInterval);

  const timeUsedSeconds = TIME_LIMIT_SECONDS - Math.max(timeRemaining, 0);
  renderResults(timeUsedSeconds, autoSubmitted);
  showScreen("screen-results");
}

function bindResultsEvents() {
  document.getElementById("retakeBtn").addEventListener("click", () => {
    showScreen("screen-welcome");
  });
}

function renderResults(timeUsedSeconds, autoSubmitted) {
  let correctCount = 0;
  const results = quizQuestions.map((q, i) => {
    const userAnswer = answers[i];
    const isCorrect = userAnswer === q.correct;
    if (isCorrect) correctCount++;
    return { q, index: i, userAnswer, isCorrect };
  });

  const total = quizQuestions.length;
  const incorrectCount = results.filter(r => r.userAnswer !== undefined && !r.isCorrect).length;
  const pct = Math.round((correctCount / total) * 100);
  const passed = pct >= PASS_THRESHOLD_PCT;

  document.getElementById("resultsGreeting").textContent = studentName
    ? `Well done, ${studentName}`
    : "Your Results";

  document.getElementById("scoreFrac").textContent = `${correctCount}/${total}`;
  document.getElementById("scorePct").textContent = `${pct}%`;

  const dial = document.getElementById("dialFg");
  const circumference = 490;
  dial.style.stroke = pct >= 70 ? "var(--litmus-green)" : pct >= PASS_THRESHOLD_PCT ? "var(--amber)" : "var(--indicator-pink)";
  requestAnimationFrame(() => {
    dial.style.strokeDashoffset = (circumference * (1 - pct / 100)).toFixed(1);
  });

  const passFail = document.getElementById("passFail");
  passFail.textContent = passed ? "Pass" : "Fail";
  passFail.className = `pass-fail ${passed ? "pass" : "fail"}`;

  document.getElementById("statCorrect").textContent = correctCount;
  document.getElementById("statIncorrect").textContent = incorrectCount;
  const m = Math.floor(timeUsedSeconds / 60), s = timeUsedSeconds % 60;
  document.getElementById("statTimeUsed").textContent = `${m}:${s.toString().padStart(2, "0")}${autoSubmitted ? " (time expired)" : ""}`;

  const breakdown = document.getElementById("breakdownList");
  breakdown.innerHTML = "";
  results.forEach(r => {
    const card = document.createElement("div");
    const status = r.userAnswer === undefined ? "unanswered" : (r.isCorrect ? "correct" : "incorrect");
    card.className = `breakdown-card ${status}`;

    const yourAnswerText = r.userAnswer ? `${r.userAnswer}. ${r.q.options[r.userAnswer]}` : "Not answered";
    const correctAnswerText = `${r.q.correct}. ${r.q.options[r.q.correct]}`;

    let notesHTML = "";
    if (!r.isCorrect) {
      const wrongLetters = ["A", "B", "C", "D"].filter(l => l !== r.q.correct);
      notesHTML = `<div class="bd-notes"><strong>Why the other options are wrong:</strong><ul>` +
        wrongLetters.map(l => `<li><strong>${l}.</strong> ${escapeHTML(r.q.notes[l] || "")}</li>`).join("") +
        `</ul></div>`;
    }

    card.innerHTML = `
      <div class="bd-top">
        <span class="bd-num">Question ${r.index + 1} · ${escapeHTML(r.q.topic)}</span>
        <span class="bd-verdict ${status}">${status === "unanswered" ? "Skipped" : status}</span>
      </div>
      <p class="bd-question">${escapeHTML(r.q.question)}</p>
      <div class="bd-row your-answer ${r.isCorrect ? "right" : "wrong"}"><span class="label">Your answer:</span>${escapeHTML(yourAnswerText)}</div>
      ${!r.isCorrect ? `<div class="bd-row correct-answer"><span class="label">Correct answer:</span>${escapeHTML(correctAnswerText)}</div>` : ""}
      <div class="bd-explain"><strong>Why:</strong> ${escapeHTML(r.q.explanation)}</div>
      ${notesHTML}
    `;
    breakdown.appendChild(card);
  });
}
