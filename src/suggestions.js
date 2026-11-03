// Concrete meal suggestions: named foods, amounts, and calories that fit what is left today.
// Pure functions, no DOM, so they can be tested on their own.

import { portionCalories } from "./calculator.js";
import { FOODS, findFood, swapKindFor } from "./foods.js";

// How much of the day's target each meal gets. Dinner gets less than lunch because the
// evening is less active. Together they add up to the whole day.
const MEAL_SHARES = { Breakfast: 0.25, Lunch: 0.35, Dinner: 0.3, Snack: 0.1 };
const SIDE_GRAMS = 150;
const MIN_PORTION_GRAMS = 50;
// When shrinking a whole meal, smaller pieces than this are not worth suggesting.
const MIN_SCALED_GRAMS = 20;
// A swap only counts as lighter if it saves at least a quarter of the calories per gram.
const LIGHTER_SWAP_RATIO = 0.75;
const MAX_SWAPS = 2;

function roundDownToTen(grams) {
  return Math.floor(grams / 10) * 10;
}

function portion(food, grams) {
  return { name: food.name, grams, kcal: portionCalories(food.kcalPer100g, grams) };
}

/** Largest portion of a food (in 10 g steps) that stays within a calorie budget. */
function gramsWithin(food, kcalBudget) {
  return roundDownToTen((kcalBudget * 100) / food.kcalPer100g);
}

function vegetableSideFor(items) {
  const hasBroccoli = items.some((item) => item.food.name === "Broccoli");
  return portion(findFood(hasBroccoli ? "Salad greens" : "Broccoli"), SIDE_GRAMS);
}

function mealPortions(items) {
  return items.map((item) => portion(item.food, item.grams));
}

function option(portions, remainingBefore, note) {
  const kcal = portions.reduce((sum, item) => sum + item.kcal, 0);
  return { items: portions, kcal, leftAfter: remainingBefore - kcal, note };
}

/** The closest lighter food of the same kind and the lightest one, so the two swaps feel different. */
function lighterSwaps(food) {
  const candidates = FOODS.filter(
    (other) =>
      other.kind === swapKindFor(food.kind) &&
      other.name !== food.name &&
      other.kcalPer100g <= food.kcalPer100g * LIGHTER_SWAP_RATIO,
  ).sort((a, b) => b.kcalPer100g - a.kcalPer100g);
  return candidates.length <= MAX_SWAPS ? candidates : [candidates[0], candidates[candidates.length - 1]];
}

/**
 * The same meal with everything except vegetables shrunk by the same factor to fit the
 * budget, plus a vegetable side if the meal has none. Null if it cannot be done sensibly.
 */
function scaledDownMeal(items, budget, remainingBefore) {
  const isVegetable = (item) => item.food.kind === "vegetable";
  const side = items.some(isVegetable) ? [] : [vegetableSideFor(items)];
  const fixed = [...mealPortions(items.filter(isVegetable)), ...side];
  const fixedKcal = fixed.reduce((sum, item) => sum + item.kcal, 0);
  const scalable = items.filter((item) => !isVegetable(item));
  const scalableKcal = scalable.reduce((sum, item) => sum + portion(item.food, item.grams).kcal, 0);
  if (scalableKcal === 0) return null;

  const factor = (budget - fixedKcal) / scalableKcal;
  if (factor <= 0 || factor >= 1) return null;
  const scaled = scalable.map((item) => portion(item.food, roundDownToTen(item.grams * factor)));
  if (scaled.some((item) => item.grams < MIN_SCALED_GRAMS)) return null;

  const note = side.length
    ? "The same meal in smaller portions, with vegetables so the plate stays full."
    : "The same meal in smaller portions; the vegetables stay as they are.";
  return option([...scaled, ...fixed], remainingBefore, note);
}

/** The meal with its highest-calorie food swapped for lighter foods of the same kind. */
function swappedMeals(items, budget, remainingBefore) {
  const portions = mealPortions(items);
  const heaviestIndex = portions.reduce((best, item, i) => (item.kcal > portions[best].kcal ? i : best), 0);
  const heaviest = items[heaviestIndex];
  if (!heaviest.food.kind) return [];

  const restKcal = portions.reduce((sum, item, i) => (i === heaviestIndex ? sum : sum + item.kcal), 0);
  const options = [];
  for (const swap of lighterSwaps(heaviest.food)) {
    const swapGrams = Math.min(heaviest.grams, gramsWithin(swap, budget - restKcal));
    if (swapGrams < MIN_PORTION_GRAMS) continue;
    const swapped = portions.map((item, i) => (i === heaviestIndex ? portion(swap, swapGrams) : item));
    options.push(option(swapped, remainingBefore, `Swap the ${heaviest.food.name} for a lighter ${swap.kind}.`));
  }
  return options;
}

function ratherSuggestions({ items, mealType, dailyTarget, remainingBefore }) {
  const budget = Math.min(remainingBefore, Math.round(dailyTarget * MEAL_SHARES[mealType]));
  const scaled = scaledDownMeal(items, budget, remainingBefore);
  const options = [...(scaled ? [scaled] : []), ...swappedMeals(items, budget, remainingBefore)];

  if (options.length === 0) {
    const side = portion(findFood("Salad greens"), SIDE_GRAMS);
    options.push(option([side], remainingBefore, "Today's budget is nearly used. If you're still hungry, this adds very little."));
  }
  return { heading: "Try instead", options };
}

function addOnSuggestion({ items, remainingBefore }) {
  const meal = mealPortions(items);
  const mealKcal = meal.reduce((sum, item) => sum + item.kcal, 0);
  const hasVegetable = items.some((item) => item.food.kind === "vegetable");
  const hasProtein = items.some((item) => item.food.kind === "protein" || item.food.kind === "dairy");

  let addition;
  let note;
  if (!hasVegetable) {
    addition = vegetableSideFor(items);
    note = "Adding vegetables makes the meal more filling for very few calories.";
  } else if (!hasProtein) {
    addition = portion(findFood("Chicken breast"), 100);
    note = "Adding lean protein keeps you full longer.";
  }
  const fits = addition && addition.kcal <= remainingBefore - mealKcal;
  return { heading: "Make it better", options: fits ? [option([...meal, addition], remainingBefore, note)] : [] };
}

/** The meal that fits the current time of day, used to preselect the meal type. */
export function mealTypeForHour(hour) {
  if (hour < 11) return "Breakfast";
  if (hour < 16) return "Lunch";
  if (hour < 21) return "Dinner";
  return "Snack";
}

/**
 * Suggests specific alternatives for a checked meal (a list of { food, grams }). A big or over-budget meal gets
 * smaller or lighter versions; a meal that fits gets a filling addition.
 */
export function suggestAlternatives({ items, mealType, verdict, dailyTarget, remainingBefore }) {
  if (verdict === "good") return addOnSuggestion({ items, remainingBefore });
  return ratherSuggestions({ items, mealType, dailyTarget, remainingBefore });
}
