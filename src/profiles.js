// Saved profiles: each one is an independent case with a name, a goal, and its own meal log.
// Everything lives in the browser's localStorage, so profiles stay on the device they were made on.

const PROFILES_KEY = "dietGuide.profiles";
const LEGACY_GOAL_KEY = "dietGuide.profile";
const LEGACY_MEALS_PREFIX = "dietGuide.meals.";

// Browser storage can be unavailable (private mode, blocked site data), so every access is guarded.
function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience here; the app still works for this visit without it.
  }
}

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function today() {
  // en-CA formats as YYYY-MM-DD in the user's local time zone, so "today" rolls over at local midnight.
  return new Date().toLocaleDateString("en-CA");
}

function mealsKey(profileId, date) {
  return `dietGuide.profile.${profileId}.meals.${date}`;
}

export function loadProfiles() {
  return loadJson(PROFILES_KEY, []);
}

export function findProfile(id) {
  return loadProfiles().find((profile) => profile.id === id);
}

/** Adds a profile and returns it. */
export function createProfile(name, goal) {
  const profile = { id: newId(), name, goal };
  saveJson(PROFILES_KEY, [...loadProfiles(), profile]);
  return profile;
}

export function updateProfile(id, changes) {
  saveJson(
    PROFILES_KEY,
    loadProfiles().map((profile) => (profile.id === id ? { ...profile, ...changes } : profile)),
  );
}

/** Removes a profile and every meal logged under it. */
export function deleteProfile(id) {
  saveJson(
    PROFILES_KEY,
    loadProfiles().filter((profile) => profile.id !== id),
  );
  try {
    const prefix = `dietGuide.profile.${id}.`;
    Object.keys(localStorage)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Nothing more to clean up if storage is unavailable.
  }
}

export function todaysMeals(profileId) {
  return loadJson(mealsKey(profileId, today()), []);
}

export function saveTodaysMeals(profileId, meals) {
  saveJson(mealsKey(profileId, today()), meals);
}

/**
 * Earlier versions kept a single goal and one meal log per day. Turn that data into
 * the first profile so nobody loses what they entered.
 */
export function migrateSingleGoal() {
  const legacyGoal = loadJson(LEGACY_GOAL_KEY, null);
  if (!legacyGoal) return;
  try {
    const profile = createProfile("My profile", legacyGoal);
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(LEGACY_MEALS_PREFIX)) continue;
      const date = key.slice(LEGACY_MEALS_PREFIX.length);
      localStorage.setItem(mealsKey(profile.id, date), localStorage.getItem(key));
      localStorage.removeItem(key);
    }
    localStorage.removeItem(LEGACY_GOAL_KEY);
  } catch {
    // If storage is unavailable there is nothing to migrate.
  }
}
