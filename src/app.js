import { ACTIVITY_LEVELS, dailyPlan, judgeMeal, validateGoal } from "./calculator.js";
import { FOODS, findFood } from "./foods.js";
import {
  createProfile,
  deleteProfile,
  findProfile,
  loadProfiles,
  migrateSingleGoal,
  saveTodaysMeals,
  todaysMeals,
  updateProfile,
} from "./profiles.js";

const OTHER_FOOD = "__other__";
const VERDICT_TITLES = {
  good: "Good for your goal",
  caution: "Fits, but it's a big meal",
  over: "Over today's target",
};

const homeView = document.getElementById("home-view");
const profileView = document.getElementById("profile-view");
const profileForm = document.getElementById("profile-form");
const mealForm = document.getElementById("meal-form");
const planBox = document.getElementById("plan");
const verdictBox = document.getElementById("verdict");
const goalSummary = document.getElementById("goal-summary");
const profileTitle = document.getElementById("profile-title");
const profileHeading = document.getElementById("profile-heading");
const renameForm = document.getElementById("rename-form");

// The profile on screen, or null while a new one is being created.
let currentProfile = null;
let plan = null;

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showErrors(listId, problems) {
  document.getElementById(listId).innerHTML = problems.map((p) => `<li>${escapeHtml(p)}</li>`).join("");
}

function fillSelects() {
  profileForm.activity.innerHTML =
    '<option value="">Choose…</option>' +
    Object.entries(ACTIVITY_LEVELS)
      .map(([value, level]) => `<option value="${value}">${level.label}</option>`)
      .join("");
  mealForm.food.innerHTML =
    '<option value="">Choose a food…</option>' +
    FOODS.map((food) => `<option>${escapeHtml(food.name)}</option>`).join("") +
    `<option value="${OTHER_FOOD}">Something else…</option>`;
}

function readGoal() {
  const data = new FormData(profileForm);
  return {
    sex: data.get("sex"),
    age: Number(data.get("age")),
    heightCm: Number(data.get("heightCm")),
    weightKg: Number(data.get("weightKg")),
    activity: data.get("activity"),
    targetLossKg: Number(data.get("targetLossKg")),
    weeks: Number(data.get("weeks")),
  };
}

function fillProfileForm(profile) {
  profileForm.elements.name.value = profile.name;
  for (const [field, value] of Object.entries(profile.goal)) profileForm.elements[field].value = value;
}

function goalDescription(goal) {
  return `Lose ${goal.targetLossKg} kg in ${goal.weeks} weeks`;
}

// ---- Home screen ----

function showHome() {
  currentProfile = null;
  plan = null;
  const profiles = loadProfiles();
  document.getElementById("profiles-empty").hidden = profiles.length > 0;
  document.getElementById("profile-list").innerHTML = profiles
    .map((profile) => {
      const valid = validateGoal(profile.goal).length === 0;
      const kcal = valid ? `${dailyPlan(profile.goal).target} kcal/day` : "";
      return `
        <li>
          <button type="button" class="profile-item" data-id="${escapeHtml(profile.id)}">
            <span><strong>${escapeHtml(profile.name)}</strong><small>${valid ? goalDescription(profile.goal) : ""}</small></span>
            <span class="kcal">${kcal}</span>
          </button>
        </li>`;
    })
    .join("");
  profileView.hidden = true;
  homeView.hidden = false;
  window.scrollTo(0, 0);
}

// ---- Profile screen ----

function showRenameForm(editing) {
  profileHeading.hidden = editing;
  renameForm.hidden = !editing;
  showErrors("rename-errors", []);
  if (editing) {
    renameForm.elements.name.value = currentProfile.name;
    renameForm.elements.name.select();
  }
}

function resetProfileScreen() {
  profileForm.reset();
  mealForm.reset();
  renameForm.hidden = true;
  profileHeading.hidden = false;
  showErrors("rename-errors", []);
  showErrors("profile-errors", []);
  showErrors("meal-errors", []);
  verdictBox.hidden = true;
  homeView.hidden = true;
  profileView.hidden = false;
  window.scrollTo(0, 0);
}

function openProfile(id) {
  const profile = findProfile(id);
  if (!profile) return showHome();
  resetProfileScreen();
  currentProfile = profile;
  profileTitle.textContent = profile.name;
  profileTitle.disabled = false;
  document.getElementById("delete-profile").hidden = false;
  fillProfileForm(profile);
  plan = dailyPlan(profile.goal);
  renderPlan();
  showGoalSummary(profile.goal);
}

function startNewProfile() {
  resetProfileScreen();
  currentProfile = null;
  plan = null;
  // A new profile is named in the goal form, so the title is not clickable yet.
  profileTitle.textContent = "New profile";
  profileTitle.disabled = true;
  document.getElementById("delete-profile").hidden = true;
  planBox.hidden = true;
  document.getElementById("meal-section").hidden = true;
  document.getElementById("today-section").hidden = true;
  showGoalForm();
  profileForm.elements.name.focus();
}

// Once a goal is saved, show a one-line summary instead of the full form so returning users go straight to their meals.
function showGoalSummary(goal) {
  const activity = ACTIVITY_LEVELS[goal.activity].label.toLowerCase();
  document.getElementById("goal-summary-text").textContent =
    `${goalDescription(goal)}. ${goal.heightCm} cm, ${goal.weightKg} kg, age ${goal.age}, ${activity}.`;
  goalSummary.hidden = false;
  profileForm.hidden = true;
}

function showGoalForm() {
  goalSummary.hidden = true;
  profileForm.hidden = false;
}

function renderPlan() {
  const warnings = plan.warnings.map((w) => `<p class="warning">${escapeHtml(w)}</p>`).join("");
  planBox.innerHTML = `
    <div class="stats">
      <div class="stat"><strong>${plan.maintenance}</strong><span>kcal to stay the same</span></div>
      <div class="stat"><strong>−${plan.deficit}</strong><span>daily deficit needed</span></div>
      <div class="stat target"><strong>${plan.target}</strong><span>kcal to eat per day</span></div>
    </div>
    ${warnings}`;
  planBox.hidden = false;
  document.getElementById("meal-section").hidden = false;
  document.getElementById("today-section").hidden = false;
  renderToday();
}

function renderToday() {
  const meals = todaysMeals(currentProfile.id);
  const eaten = meals.reduce((sum, meal) => sum + meal.kcal, 0);
  document.getElementById("today-empty").hidden = meals.length > 0;
  document.getElementById("clear-today").hidden = meals.length === 0;
  document.getElementById("today-list").innerHTML = meals
    .map((m) => `<li>${escapeHtml(m.mealType)}: ${m.grams} g ${escapeHtml(m.foodName)}, ${m.kcal} kcal</li>`)
    .join("");
  document.getElementById("today-total").textContent = meals.length
    ? `Eaten ${eaten} of ${plan.target} kcal. ${Math.max(plan.target - eaten, 0)} kcal left.`
    : "";
}

function selectedFood(data) {
  if (data.get("food") !== OTHER_FOOD) return findFood(data.get("food"));
  return { name: data.get("customName").trim(), kcalPer100g: Number(data.get("customKcal")) };
}

function validateMeal(data, food) {
  const problems = [];
  if (!data.get("food")) problems.push("Choose what you ate.");
  if (data.get("food") === OTHER_FOOD) {
    if (!food.name) problems.push("Enter the food's name.");
    if (!(food.kcalPer100g > 0 && food.kcalPer100g <= 900)) problems.push("Calories per 100 g must be between 1 and 900.");
  }
  const grams = Number(data.get("grams"));
  if (!(grams > 0 && grams <= 3000)) problems.push("Amount must be between 1 and 3000 g.");
  return problems;
}

// ---- Events ----

document.getElementById("profile-list").addEventListener("click", (event) => {
  const item = event.target.closest(".profile-item");
  if (item) openProfile(item.dataset.id);
});

document.getElementById("new-profile").addEventListener("click", startNewProfile);
document.getElementById("back-home").addEventListener("click", showHome);

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = profileForm.elements.name.value.trim();
  const goal = readGoal();
  const problems = [...(name ? [] : ["Give this profile a name."]), ...validateGoal(goal)];
  showErrors("profile-errors", problems);
  if (problems.length) return;

  if (currentProfile) {
    updateProfile(currentProfile.id, { name, goal });
    openProfile(currentProfile.id);
  } else {
    openProfile(createProfile(name, goal).id);
  }
});

profileTitle.addEventListener("click", () => showRenameForm(true));
document.getElementById("cancel-rename").addEventListener("click", () => showRenameForm(false));

renameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = renameForm.elements.name.value.trim();
  if (!name) return showErrors("rename-errors", ["Give this profile a name."]);
  updateProfile(currentProfile.id, { name });
  currentProfile = findProfile(currentProfile.id);
  profileTitle.textContent = name;
  profileForm.elements.name.value = name;
  showRenameForm(false);
});

document.getElementById("edit-goal").addEventListener("click", showGoalForm);

document.getElementById("cancel-edit").addEventListener("click", () => {
  if (!currentProfile) return showHome();
  fillProfileForm(currentProfile);
  showErrors("profile-errors", []);
  showGoalSummary(currentProfile.goal);
});

document.getElementById("delete-profile").addEventListener("click", () => {
  if (!confirm(`Delete "${currentProfile.name}" and all of its meals? This cannot be undone.`)) return;
  deleteProfile(currentProfile.id);
  showHome();
});

mealForm.food.addEventListener("change", () => {
  const isOther = mealForm.food.value === OTHER_FOOD;
  document.getElementById("custom-name-field").hidden = !isOther;
  document.getElementById("custom-kcal-field").hidden = !isOther;
});

mealForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(mealForm);
  const food = selectedFood(data) ?? {};
  const problems = validateMeal(data, food);
  showErrors("meal-errors", problems);
  if (problems.length) return;

  const meals = todaysMeals(currentProfile.id);
  const grams = Number(data.get("grams"));
  const eatenSoFar = meals.reduce((sum, meal) => sum + meal.kcal, 0);
  const result = judgeMeal({ food, grams, dailyTarget: plan.target, eatenSoFar });

  verdictBox.innerHTML = `
    <div class="verdict ${result.verdict}">
      <h3>${VERDICT_TITLES[result.verdict]}</h3>
      ${result.advice.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
    </div>`;
  verdictBox.hidden = false;

  meals.push({ mealType: data.get("mealType"), foodName: food.name, grams, kcal: result.kcal });
  saveTodaysMeals(currentProfile.id, meals);
  renderToday();
});

document.getElementById("clear-today").addEventListener("click", () => {
  if (!confirm("Remove all of today's meals?")) return;
  saveTodaysMeals(currentProfile.id, []);
  verdictBox.hidden = true;
  renderToday();
});

fillSelects();
migrateSingleGoal();
showHome();
