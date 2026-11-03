// Looks up foods that are not in the built-in list, using the free Open Food Facts database.
// It mostly holds packaged products, so results are shown for the user to choose from, never applied automatically.

const SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const MAX_RESULTS = 5;
const TIMEOUT_MS = 15000;

/** Turns raw Open Food Facts products into { name, brand, kcalPer100g }, dropping ones without usable calories. */
export function toFoodResults(products) {
  const seen = new Set();
  const results = [];
  for (const product of products) {
    const name = (product.product_name ?? "").trim();
    const kcal = Number(product.nutriments?.["energy-kcal_100g"]);
    if (!name || !(kcal > 0 && kcal <= 900)) continue;
    const brand = (product.brands ?? "").split(",")[0].trim();
    const key = `${name.toLowerCase()}|${Math.round(kcal)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ name, brand, kcalPer100g: Math.round(kcal) });
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}

/** Searches by food name. Throws an Error with a message fit to show the user if the lookup fails. */
export async function searchFoods(query) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "20",
    fields: "product_name,brands,nutriments",
  });
  let response;
  try {
    response = await fetch(`${SEARCH_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    // When the database is rate limiting, the browser also reports a failed fetch, so cover both causes.
    throw new Error(
      "Couldn't reach the food database. Check your connection, or wait a minute if you searched several times. " +
        "You can also enter the calories yourself.",
    );
  }
  if (response.status === 429) {
    throw new Error("Too many searches in a short time. Wait a minute and try again, or enter the calories yourself.");
  }
  if (!response.ok) {
    throw new Error("The food database is busy right now. Try again soon, or enter the calories yourself.");
  }
  try {
    const data = await response.json();
    return toFoodResults(data.products ?? []);
  } catch {
    throw new Error("The food database sent back something unexpected. Try again, or enter the calories yourself.");
  }
}
