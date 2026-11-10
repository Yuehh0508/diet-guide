import { ACTIVITY_LEVELS, KCAL_PER_KG_FAT, dailyPlan, judgeMeal, validateGoal } from "./calculator.js";
import { searchFoods } from "./foodSearch.js";
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
import { mealTypeForHour, suggestAlternatives } from "./suggestions.js";

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
  resetMealForm();
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

/** Walks through the calculation with the user's own numbers, so the target is not a mystery. */
function planExplanation(goal) {
  const activity = ACTIVITY_LEVELS[goal.activity];
  const unheldTarget = plan.maintenance - plan.deficit;
  const lastStep =
    plan.target > unheldTarget
      ? `That would be ${unheldTarget} kcal, which is below the safe minimum, so your target is held at ${plan.target} kcal.`
      : `${plan.maintenance} − ${plan.deficit} = <strong>${plan.target} kcal</strong> to eat per day.`;
  return `
    <details class="plan-explainer">
      <summary>How is this worked out?</summary>
      <ol>
        <li>At rest, your body burns about <strong>${plan.bmr} kcal</strong> a day. This comes from your sex, age,
          height, and weight (the Mifflin-St Jeor formula).</li>
        <li>Your activity level (${escapeHtml(activity.label.toLowerCase())}) multiplies that by ${activity.factor}:
          about <strong>${plan.maintenance} kcal</strong> a day keeps your weight the same.</li>
        <li>Losing 1 kg of body fat takes about ${KCAL_PER_KG_FAT.toLocaleString("en-US")} kcal.
          ${goal.targetLossKg} kg × ${KCAL_PER_KG_FAT.toLocaleString("en-US")} ÷ (${goal.weeks} weeks × 7 days)
          = <strong>${plan.deficit} kcal</strong> less per day.</li>
        <li>${lastStep}</li>
      </ol>
    </details>`;
}

function renderPlan() {
  const warnings = plan.warnings.map((w) => `<p class="warning">${escapeHtml(w)}</p>`).join("");
  planBox.innerHTML = `
    <div class="stats">
      <div class="stat"><strong>${plan.maintenance}</strong><span>kcal to stay the same</span></div>
      <div class="stat"><strong>−${plan.deficit}</strong><span>daily deficit needed</span></div>
      <div class="stat target"><strong>${plan.target}</strong><span>kcal to eat per day</span></div>
    </div>
    ${planExplanation(currentProfile.goal)}
    ${warnings}`;
  planBox.hidden = false;
  document.getElementById("meal-section").hidden = false;
  document.getElementById("today-section").hidden = false;
  renderToday();
}

function describeMealFoods(meal) {
  // Meals logged before multi-food meals have a single foodName and grams instead of items.
  const items = meal.items ?? [{ name: meal.foodName, grams: meal.grams }];
  return items.map((item) => `${item.grams} g ${escapeHtml(item.name)}`).join(" + ");
}

function renderToday() {
  const meals = todaysMeals(currentProfile.id);
  const eaten = meals.reduce((sum, meal) => sum + meal.kcal, 0);
  document.getElementById("today-empty").hidden = meals.length > 0;
  document.getElementById("clear-today").hidden = meals.length === 0;
  document.getElementById("today-list").innerHTML = meals
    .map((m) => `<li>${escapeHtml(m.mealType)}: ${describeMealFoods(m)}, ${m.kcal} kcal</li>`)
    .join("");
  document.getElementById("today-total").textContent = meals.length
    ? `Eaten ${eaten} of ${plan.target} kcal. ${Math.max(plan.target - eaten, 0)} kcal left.`
    : "";
}

function renderSuggestions({ heading, options }) {
  if (options.length === 0) return "";
  const items = options
    .map((choice) => {
      const foods = choice.items.map((item) => `${item.grams} g ${escapeHtml(item.name)}`).join(" + ");
      return `
        <li>
          <strong>${foods}</strong>
          <span class="suggestion-kcal">${choice.kcal} kcal · leaves ${Math.max(choice.leftAfter, 0)} kcal today</span>
          <span class="suggestion-note">${escapeHtml(choice.note)}</span>
        </li>`;
    })
    .join("");
  return `<div class="suggestions"><h4>${heading}</h4><ul>${items}</ul></div>`;
}

// ---- Meal form: one row per food ----

const foodRows = document.getElementById("food-rows");
const foodRowTemplate = document.getElementById("food-row-template");

const FOOD_OPTIONS =
  '<option value="">Choose a food…</option>' +
  FOODS.map((food) => `<option>${escapeHtml(food.name)}</option>`).join("") +
  `<option value="${OTHER_FOOD}">Something else…</option>`;

function updateRemoveButtons() {
  const rows = foodRows.querySelectorAll(".food-row");
  rows.forEach((row) => (row.querySelector(".remove-food").hidden = rows.length === 1));
}

/** Shows a food's photo in its row, or the empty plate when there is no photo to show. */
function showFoodPhoto(row, photo, name) {
  const image = row.querySelector(".food-photo");
  image.hidden = !photo;
  row.querySelector(".food-photo-placeholder").hidden = Boolean(photo);
  if (photo) {
    image.src = photo;
    image.alt = name;
  } else {
    image.removeAttribute("src");
    image.alt = "";
  }
}

function showSearchMessage(row, message) {
  row.querySelector(".search-area").hidden = false;
  row.querySelector(".search-status").textContent = message;
  row.querySelector(".search-results").replaceChildren();
}

function showSearchResults(row, results) {
  showSearchMessage(row, "Pick the closest match. These are mostly packaged products, so check the calories look right.");
  const list = row.querySelector(".search-results");
  for (const result of results) {
    const item = document.createElement("li");
    item.innerHTML = `
      <button type="button">
        ${result.photo ? `<img src="${escapeHtml(result.photo)}" alt="" loading="lazy" />` : ""}
        <span class="result-name">${escapeHtml(result.name)}${result.brand ? `<br /><small>${escapeHtml(result.brand)}</small>` : ""}</span>
        <span class="kcal">${result.kcalPer100g} kcal/100 g</span>
      </button>`;
    item.querySelector("img")?.addEventListener("error", (event) => event.target.remove());
    item.querySelector("button").addEventListener("click", () => {
      row.querySelector('[name="customName"]').value = result.name;
      row.querySelector('[name="customKcal"]').value = result.kcalPer100g;
      showFoodPhoto(row, result.photo, result.name);
      showSearchMessage(row, `Filled in ${result.name}: ${result.kcalPer100g} kcal per 100 g. You can still edit it.`);
    });
    list.append(item);
  }
}

// Searching runs only on request (button or Enter), because Open Food Facts limits how often it can be searched.
function setUpFoodSearch(row) {
  const nameInput = row.querySelector('[name="customName"]');
  const searchButton = row.querySelector(".search-food");

  async function search() {
    const query = nameInput.value.trim();
    if (query.length < 2) {
      showSearchMessage(row, "Type at least 2 letters of the food's name, then search.");
      return;
    }
    searchButton.disabled = true;
    showSearchMessage(row, `Searching for "${query}"…`);
    try {
      const results = await searchFoods(query);
      if (results.length) showSearchResults(row, results);
      else showSearchMessage(row, `No match for "${query}". Enter its calories per 100 g yourself below.`);
    } catch (error) {
      showSearchMessage(row, error.message);
    } finally {
      searchButton.disabled = false;
    }
  }

  searchButton.addEventListener("click", search);
  // A typed name may no longer match the photo of a picked search result.
  nameInput.addEventListener("input", () => showFoodPhoto(row, "", ""));
  nameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    search();
  });
}

function addFoodRow() {
  const row = foodRowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".food-photo").addEventListener("error", () => showFoodPhoto(row, "", ""));
  const select = row.querySelector("select");
  select.innerHTML = FOOD_OPTIONS;
  select.addEventListener("change", () => {
    const isOther = select.value === OTHER_FOOD;
    row.querySelectorAll(".custom-field").forEach((field) => (field.hidden = !isOther));
    if (!isOther) row.querySelector(".search-area").hidden = true;
    const food = findFood(select.value);
    showFoodPhoto(row, food?.photo, food?.name);
  });
  setUpFoodSearch(row);
  row.querySelector(".remove-food").addEventListener("click", () => {
    row.remove();
    updateRemoveButtons();
    // Row numbers in the messages shift once a row is gone, so clear them until the next check.
    showErrors("meal-errors", []);
  });
  foodRows.append(row);
  updateRemoveButtons();
  return row;
}

function resetMealForm() {
  mealForm.reset();
  mealForm.mealType.value = mealTypeForHour(new Date().getHours());
  foodRows.replaceChildren();
  addFoodRow();
}

/** Reads every food row into { food, grams } items, plus any problems to show the user. */
function readMealItems() {
  const rows = [...foodRows.querySelectorAll(".food-row")];
  const items = [];
  const problems = [];
  rows.forEach((row, index) => {
    const label = rows.length > 1 ? `Food ${index + 1}: ` : "";
    const choice = row.querySelector('[name="food"]').value;
    const grams = Number(row.querySelector('[name="grams"]').value);
    let food = findFood(choice);
    if (!choice) problems.push(`${label}Choose what you ate.`);
    if (choice === OTHER_FOOD) {
      food = {
        name: row.querySelector('[name="customName"]').value.trim(),
        kcalPer100g: Number(row.querySelector('[name="customKcal"]').value),
      };
      if (!food.name) problems.push(`${label}Enter the food's name.`);
      if (!(food.kcalPer100g > 0 && food.kcalPer100g <= 900)) {
        problems.push(`${label}Calories per 100 g must be between 1 and 900.`);
      }
    }
    if (!(grams > 0 && grams <= 3000)) problems.push(`${label}Amount must be between 1 and 3000 g.`);
    if (food) items.push({ food, grams });
  });
  return { items, problems };
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

document.getElementById("add-food").addEventListener("click", () => {
  addFoodRow().querySelector("select").focus();
});

mealForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const { items, problems } = readMealItems();
  showErrors("meal-errors", problems);
  if (problems.length) return;

  const mealType = mealForm.mealType.value;
  const meals = todaysMeals(currentProfile.id);
  const eatenSoFar = meals.reduce((sum, meal) => sum + meal.kcal, 0);
  const result = judgeMeal({ items, dailyTarget: plan.target, eatenSoFar });
  const suggestions = suggestAlternatives({
    items,
    mealType,
    verdict: result.verdict,
    dailyTarget: plan.target,
    remainingBefore: plan.target - eatenSoFar,
  });

  verdictBox.innerHTML = `
    <div class="verdict ${result.verdict}">
      <h3>${VERDICT_TITLES[result.verdict]}</h3>
      ${result.advice.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
      ${renderSuggestions(suggestions)}
    </div>`;
  verdictBox.hidden = false;

  const loggedItems = items.map(({ food, grams }) => ({ name: food.name, grams }));
  meals.push({ mealType, items: loggedItems, kcal: result.kcal });
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
