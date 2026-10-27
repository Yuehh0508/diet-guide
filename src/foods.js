// A small starter list of common foods. Calories are approximate, per 100 g as eaten (cooked).

export const FOODS = [
  { name: "Steak (beef sirloin)", kcalPer100g: 250, tip: "Steak is high in protein, which keeps you full, but it is calorie-dense. Pairing a smaller portion with vegetables makes the meal bigger for fewer calories." },
  { name: "Chicken breast", kcalPer100g: 165, tip: "Chicken breast is lean protein, a good base for a cutting diet." },
  { name: "Salmon", kcalPer100g: 208, tip: "Salmon has healthy fats; keep portions moderate." },
  { name: "Pork belly", kcalPer100g: 518, tip: "Pork belly is mostly fat. A leaner cut like pork loin has about a third of the calories." },
  { name: "Egg", kcalPer100g: 155, tip: "Eggs are filling and high in protein. One large egg is about 50 g." },
  { name: "Tofu", kcalPer100g: 76, tip: "Tofu is low in calories and high in protein." },
  { name: "White rice", kcalPer100g: 130, tip: "A typical bowl of rice is about 200 g. Swapping half for vegetables saves calories." },
  { name: "Noodles", kcalPer100g: 138 },
  { name: "Bread", kcalPer100g: 265 },
  { name: "Potato", kcalPer100g: 87 },
  { name: "Broccoli", kcalPer100g: 35, tip: "Vegetables like broccoli add volume for very few calories." },
  { name: "Salad greens", kcalPer100g: 17, tip: "Watch the dressing: it often has more calories than the salad." },
  { name: "Apple", kcalPer100g: 52 },
  { name: "Banana", kcalPer100g: 89 },
  { name: "Milk", kcalPer100g: 61 },
  { name: "Greek yogurt (plain)", kcalPer100g: 97, tip: "Plain Greek yogurt is high in protein. Flavored ones add sugar." },
  { name: "Cheese pizza", kcalPer100g: 266, tip: "One slice is about 100 g." },
  { name: "Hamburger", kcalPer100g: 254 },
  { name: "French fries", kcalPer100g: 312, tip: "Fries are calorie-dense. A side salad or baked potato is a lighter swap." },
  { name: "Fried rice", kcalPer100g: 174 },
  { name: "Dumplings", kcalPer100g: 220, tip: "Steamed dumplings are lighter than pan-fried ones." },
  { name: "Chocolate", kcalPer100g: 546 },
];

export function findFood(name) {
  return FOODS.find((food) => food.name === name);
}
