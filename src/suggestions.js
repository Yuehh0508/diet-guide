// Concrete meal suggestions: named foods, amounts, and calories that fit what is left today.
// Pure functions, no DOM, so they can be tested on their own.

import { portionCalories } from "./calculator.js";
import { FOODS, findFood, swapKindFor } from "./foods.js";

// How much of the day's target each meal gets. Dinner gets less than lunch because the
// evening is less active. Together they add up to the whole day.
const MEAL_SHARES = { Breakfast: 0.25, Lunch: 0.35, Dinner: 0.3, Snack: 0.1 };
const SIDE_GRAMS = 150;
const MIN_PORTION_GRAMS = 50;
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

function vegetableSideFor(food) {
  return portion(findFood(food.name === "Broccoli" ? "Salad greens" : "Broccoli"), SIDE_GRAMS);
}

function option(items, remainingBefore, note) {
  const kcal = items.reduce((sum, item) => sum + item.kcal, 0);
  return { items, kcal, leftAfter: remainingBefore - kcal, note };
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

function ratherSuggestions({ food, grams, mealType, dailyTarget, remainingBefore }) {
  const budget = Math.min(remainingBefore, Math.round(dailyTarget * MEAL_SHARES[mealType]));
  const options = [];

  if (food.kind !== "vegetable") {
    const side = vegetableSideFor(food);
    const smallerGrams = Math.min(gramsWithin(food, budget - side.kcal), grams - 10);
    if (smallerGrams >= MIN_PORTION_GRAMS) {
      options.push(
        option([portion(food, smallerGrams), side], remainingBefore, "A smaller portion with vegetables, so the plate stays full."),
      );
    }
  }

  if (food.kind) {
    for (const swap of lighterSwaps(food)) {
      const swapGrams = Math.min(grams, gramsWithin(swap, budget));
      if (swapGrams >= MIN_PORTION_GRAMS) {
        options.push(option([portion(swap, swapGrams)], remainingBefore, `A lighter ${swap.kind} instead.`));
      }
    }
  }

  if (options.length === 0) {
    const side = portion(findFood("Salad greens"), SIDE_GRAMS);
    options.push(option([side], remainingBefore, "Today's budget is nearly used. If you're still hungry, this adds very little."));
  }
  return { heading: "Try instead", options };
}

function addOnSuggestion({ food, grams, remainingBefore }) {
  const meal = portion(food, grams);
  const lowProtein = food.kind === "vegetable" || food.kind === "fruit";
  const addition = lowProtein ? portion(findFood("Chicken breast"), 100) : vegetableSideFor(food);
  const note = lowProtein
    ? "Adding lean protein keeps you full longer."
    : "Adding vegetables makes the meal more filling for very few calories.";
  const options = addition.kcal <= remainingBefore - meal.kcal ? [option([meal, addition], remainingBefore, note)] : [];
  return { heading: "Make it better", options };
}

/** The meal that fits the current time of day, used to preselect the meal type. */
export function mealTypeForHour(hour) {
  if (hour < 11) return "Breakfast";
  if (hour < 16) return "Lunch";
  if (hour < 21) return "Dinner";
  return "Snack";
}

/**
 * Suggests specific alternatives for a checked meal. A big or over-budget meal gets
 * smaller or lighter versions; a meal that fits gets a filling addition.
 */
export function suggestAlternatives({ food, grams, mealType, verdict, dailyTarget, remainingBefore }) {
  if (verdict === "good") return addOnSuggestion({ food, grams, remainingBefore });
  return ratherSuggestions({ food, grams, mealType, dailyTarget, remainingBefore });
}
