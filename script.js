/* ===================================================
   MindScore — script.js
   Talks to the FastAPI backend at API_BASE_URL/predict
=================================================== */

// While you're developing locally, this points at your local uvicorn server.
// Once you deploy the API somewhere (Render, Railway, a VPS, etc.), replace
// the string below with that public URL — everything else in this file
// stays the same.
const isLocal = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
const API_BASE_URL = isLocal
  ? "http://127.0.0.1:2200"
  : "https://mindscore-checker.onrender.com";

document.getElementById("year").textContent = new Date().getFullYear();

/* ---------------------------------------------------
   Mobile nav
--------------------------------------------------- */
const navToggle = document.querySelector(".nav-toggle");
const mobileNav = document.getElementById("mobile-nav");
navToggle.addEventListener("click", () => {
  const open = mobileNav.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", String(open));
});
mobileNav.querySelectorAll("a").forEach(link =>
  link.addEventListener("click", () => {
    mobileNav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  })
);

/* ---------------------------------------------------
   Live slider readouts
--------------------------------------------------- */
const sliderOutputs = [
  ["usage", "usage-out"],
  ["sleep", "sleep-out"],
  ["study", "study-out"],
  ["activity", "activity-out"],
];
sliderOutputs.forEach(([sliderId, outId]) => {
  const slider = document.getElementById(sliderId);
  const out = document.getElementById(outId);
  const update = () => { out.textContent = Number(slider.value).toFixed(1); };
  slider.addEventListener("input", update);
  update();
});

/* ---------------------------------------------------
   Prediction call — isolated so it's easy to swap
   later (e.g. add auth headers, change the URL, etc.)
--------------------------------------------------- */
async function predictMentalHealthScore(data) {
  const response = await fetch(`${API_BASE_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errBody = await response.json();
      detail = errBody?.detail ? ` — ${JSON.stringify(errBody.detail)}` : "";
    } catch (_) { /* ignore parse failure */ }
    throw new Error(`API responded with ${response.status}${detail}`);
  }

  const result = await response.json();
  return result.predicted_mental_heath_score;
}

/* ---------------------------------------------------
   Build the payload the backend's Pydantic model expects
--------------------------------------------------- */
function collectPayload(form) {
  const fd = new FormData(form);

  const asFloat = (key) => parseFloat(fd.get(key));
  const asInt = (key) => parseInt(fd.get(key), 10);
  const asStr = (key) => (fd.get(key) || "").toString().trim();

  return {
    age: asInt("age"),
    gender: asStr("gender"),
    country: asStr("country"),
    academic_level: asStr("academic_level"),
    most_used_platform: asStr("most_used_platform"),
    purpose_of_use: asStr("purpose_of_use"),
    avg_daily_usage_hours: asFloat("avg_daily_usage_hours"),
    daily_unlocks: asInt("daily_unlocks"),
    study_hours: asFloat("study_hours"),
    physical_activity_hours: asFloat("physical_activity_hours"),
    sleep_hours_per_night: asFloat("sleep_hours_per_night"),
    stress_level: asStr("stress_level"),
  };
}

/* ---------------------------------------------------
   Validation
--------------------------------------------------- */
function validatePayload(form, payload) {
  if (!form.checkValidity()) return "Please fill in every field before predicting.";
  if (!payload.stress_level) return "Please choose a stress level.";
  if (Number.isNaN(payload.age) || payload.age < 10 || payload.age > 100) {
    return "Age must be between 10 and 100.";
  }
  if (Number.isNaN(payload.daily_unlocks) || payload.daily_unlocks < 0) {
    return "Daily unlocks must be zero or more.";
  }
  if (!payload.country) return "Please enter a country.";
  return null;
}

/* ---------------------------------------------------
   Result rendering
--------------------------------------------------- */
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 86; // matches r=86 in the SVG

function categoryFor(score) {
  if (score <= 3) return { label: "Needs Attention", cls: "state-attention",
    text: "Your predicted score suggests it may help to check in with your habits, or with someone you trust." };
  if (score <= 6) return { label: "Moderate", cls: "state-moderate",
    text: "Your predicted score suggests a fairly balanced picture, with some room to adjust your routine." };
  if (score <= 8) return { label: "Good", cls: "state-good",
    text: "Your predicted score suggests relatively positive overall well-being based on the information provided." };
  return { label: "Excellent", cls: "state-excellent",
    text: "Your predicted score suggests strong overall well-being based on the information provided." };
}

function factorChips(payload) {
  return [
    `${payload.avg_daily_usage_hours}h screen time`,
    `${payload.sleep_hours_per_night}h sleep`,
    `${payload.study_hours}h study/work`,
    `${payload.physical_activity_hours}h activity`,
    `${payload.daily_unlocks} unlocks/day`,
    `Stress: ${payload.stress_level}`,
    `Platform: ${payload.most_used_platform}`,
  ];
}

function renderResult(rawScore, payload) {
  const resultCard = document.getElementById("result-card");
  const gaugeFill = document.getElementById("gauge-fill");
  const gaugeValue = document.getElementById("gauge-value");
  const statusEl = document.getElementById("result-status");
  const explanationEl = document.getElementById("result-explanation");
  const factorsList = document.getElementById("key-factors-list");

  // Round once, up front — every downstream decision (category, gauge,
  // displayed number) uses this same value so they can never disagree.
  const score = Math.round(rawScore * 10) / 10;
  const clamped = Math.max(0, Math.min(10, score));
  const { label, cls, text } = categoryFor(clamped);

  resultCard.hidden = false;
  statusEl.textContent = label;
  statusEl.className = `result-status ${cls}`;
  explanationEl.textContent = text;

  factorsList.innerHTML = "";
  factorChips(payload).forEach(chip => {
    const li = document.createElement("li");
    li.textContent = chip;
    factorsList.appendChild(li);
  });

  // Animate the number
  const start = 0;
  const duration = 900;
  const startTime = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    gaugeValue.textContent = (start + (score - start) * eased).toFixed(1);
    if (p < 1) requestAnimationFrame(tick);
    else gaugeValue.textContent = score.toFixed(1);
  }
  requestAnimationFrame(tick);

  // Animate the ring
  const offset = GAUGE_CIRCUMFERENCE - (clamped / 10) * GAUGE_CIRCUMFERENCE;
  gaugeFill.style.strokeDasharray = String(GAUGE_CIRCUMFERENCE);
  gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE);
  requestAnimationFrame(() => {
    gaugeFill.style.strokeDashoffset = String(offset);
  });
  const ringColor = cls === "state-attention" ? "var(--coral)"
    : cls === "state-moderate" ? "var(--amber)"
    : "var(--teal)";
  gaugeFill.style.stroke = ringColor;

  resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------------------------------------------------
   Form submit
--------------------------------------------------- */
const form = document.getElementById("predict-form");
const errorBox = document.getElementById("form-error");
const predictBtn = document.getElementById("predict-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.hidden = true;

  const payload = collectPayload(form);
  const validationMessage = validatePayload(form, payload);
  if (validationMessage) {
    errorBox.textContent = validationMessage;
    errorBox.hidden = false;
    return;
  }

  predictBtn.setAttribute("aria-busy", "true");
  predictBtn.disabled = true;

  try {
    const score = await predictMentalHealthScore(payload);
    renderResult(score, payload);
  } catch (err) {
    errorBox.textContent = `Couldn't reach the prediction model: ${err.message}. ` +
      `Make sure the API is running at ${API_BASE_URL}.`;
    errorBox.hidden = false;
  } finally {
    predictBtn.removeAttribute("aria-busy");
    predictBtn.disabled = false;
  }
});

document.getElementById("try-again").addEventListener("click", () => {
  document.getElementById("result-card").hidden = true;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});
