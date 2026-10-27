// Calorie math for the diet guide. Pure functions, no DOM, so they can be tested on their own.

export const KCAL_PER_KG_FAT = 7700;

export const ACTIVITY_LEVELS = {
  sedentary: { label: "Mostly sitting (little exercise)", factor: 1.2 },
  light: { label: "Light exercise 1–3 days/week", factor: 1.375 },
  moderate: { label: "Moderate exercise 3–5 days/week", factor: 1.55 },
  active: { label: "Hard exercise 6–7 days/week", factor: 1.725 },
};

// Commonly cited floors below which a diet should be supervised by a professional.
const MIN_DAILY_KCAL = { male: 1500, female: 1200 };

// Losing more than about 1% of body weight per week is generally considered too fast.
const MAX_WEEKLY_LOSS_FRACTION = 0.01;

/** Mifflin-St Jeor basal metabolic rate, in kcal/day. */
export function basalMetabolicRate({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

/** Validates a goal (body stats plus weight-loss target) and returns a list of human-readable problems (empty if valid). */
export function validateGoal(goal) {
  const problems = [];
  const { sex, age, heightCm, weightKg, activity, targetLossKg, weeks } = goal;
  if (sex !== "male" && sex !== "female") problems.push("Choose a sex for the calorie formula.");
  if (!(age >= 15 && age <= 100)) problems.push("Age must be between 15 and 100.");
  if (!(heightCm >= 120 && heightCm <= 230)) problems.push("Height must be between 120 and 230 cm.");
  if (!(weightKg >= 35 && weightKg <= 300)) problems.push("Weight must be between 35 and 300 kg.");
  if (!ACTIVITY_LEVELS[activity]) problems.push("Choose an activity level.");
  if (!(targetLossKg > 0 && targetLossKg < weightKg)) problems.push("Weight to lose must be more than 0 kg.");
  if (!(weeks >= 1 && weeks <= 104)) problems.push("Time frame must be between 1 and 104 weeks.");
  return problems;
}

/**
 * Turns a goal into a daily plan: maintenance calories, the deficit
 * the goal needs, the resulting daily calorie target, and any safety warnings.
 */
export function dailyPlan(goal) {
  const bmr = basalMetabolicRate(goal);
  const maintenance = bmr * ACTIVITY_LEVELS[goal.activity].factor;
  const deficit = (goal.targetLossKg * KCAL_PER_KG_FAT) / (goal.weeks * 7);
  const minimum = MIN_DAILY_KCAL[goal.sex];
  const target = Math.max(maintenance - deficit, minimum);

  const warnings = [];
  const weeklyLossKg = goal.targetLossKg / goal.weeks;
  const safeWeeklyLossKg = goal.weightKg * MAX_WEEKLY_LOSS_FRACTION;
  if (weeklyLossKg > safeWeeklyLossKg) {
    const saferWeeks = Math.ceil(goal.targetLossKg / safeWeeklyLossKg);
    warnings.push(
      `Losing ${weeklyLossKg.toFixed(1)} kg a week is faster than the usual safe pace ` +
        `(about ${safeWeeklyLossKg.toFixed(1)} kg a week for you). Consider ${saferWeeks} weeks instead.`,
    );
  }
  if (maintenance - deficit < minimum) {
    warnings.push(
      `This goal would put you below ${minimum} kcal a day, so your target is held at ${minimum}. ` +
        "You will reach the goal more slowly than planned.",
    );
  }

  return {
    bmr: Math.round(bmr),
    maintenance: Math.round(maintenance),
    deficit: Math.round(deficit),
    target: Math.round(target),
    warnings,
  };
}

/** Calories in a portion, given the food's kcal per 100 g. */
export function portionCalories(kcalPer100g, grams) {
  return Math.round((kcalPer100g * grams) / 100);
}

/**
 * Judges one meal against the day's target, counting meals already eaten today.
 * Returns a verdict ("good" | "caution" | "over") and plain-language advice.
 */
export function judgeMeal({ food, grams, dailyTarget, eatenSoFar }) {
  const kcal = portionCalories(food.kcalPer100g, grams);
  const remainingBefore = dailyTarget - eatenSoFar;
  const remainingAfter = remainingBefore - kcal;
  const shareOfDay = kcal / dailyTarget;
  const advice = [];

  let verdict;
  if (remainingAfter < 0) {
    verdict = "over";
    advice.push(
      `This meal is ${kcal} kcal, which takes you ${-remainingAfter} kcal over today's target. ` +
        "Today you would not have a deficit from this meal.",
    );
    const fittingGrams = Math.max(0, Math.floor((remainingBefore * 100) / food.kcalPer100g / 10) * 10);
    if (fittingGrams > 0) advice.push(`About ${fittingGrams} g of ${food.name} would fit what you have left today.`);
  } else if (shareOfDay > 0.4) {
    verdict = "caution";
    advice.push(
      `This meal is ${kcal} kcal, ${Math.round(shareOfDay * 100)}% of your whole day. ` +
        `It still fits, leaving ${remainingAfter} kcal, but it is a large share for one meal.`,
    );
  } else {
    verdict = "good";
    advice.push(`This meal is ${kcal} kcal and fits your plan, leaving ${remainingAfter} kcal for today.`);
  }

  if (food.tip) advice.push(food.tip);

  return { kcal, verdict, remainingAfter, advice };
}
