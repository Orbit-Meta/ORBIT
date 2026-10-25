// Code-level check that a group message doesn't reveal anyone's private answers.
// A term counts as private if someone gave it in a DM AND it was never said out loud in the call.

const STOPWORDS = new Set(
  'about after again also anything around because before being cannot could does doing dont during each even ever every from have just know like make maybe more most much need only other over please really should some still such than that their them then there these they thing think this those through time today tomorrow under until very want week well were what when where which while will with would your yours yeah okay sure fine good great free busy prefer preference none nope nothing works work anytime whatever'.split(' '),
);

function words(text) {
  return (text.toLowerCase().match(/[\p{L}]{4,}/gu) ?? []).filter((w) => !STOPWORDS.has(w));
}

/**
 * @param {string[]} privateTexts  Everything people said privately (raw answers + parsed constraints)
 * @param {string}   publicText    Everything already public (the call transcript)
 * @returns {{ words: Set<string>, numbers: Set<string> }}
 */
export function privateTerms(privateTexts, publicText) {
  const publicWords = new Set(words(publicText));
  const publicNumbers = new Set(publicText.match(/\d+/g) ?? []);
  const termWords = new Set();
  const numbers = new Set();
  for (const t of privateTexts) {
    for (const w of words(t)) if (!publicWords.has(w)) termWords.add(w);
    for (const n of t.match(/\d+/g) ?? []) if (!publicNumbers.has(n)) numbers.add(n);
  }
  return { words: termWords, numbers };
}

/** Returns the private terms found in `text` (empty array = safe to post). */
export function findLeaks(text, terms) {
  const leaks = words(text).filter((w) => terms.words.has(w));
  // Numbers only count as leaks when they look like money or a quantity, not a time we chose ("6:30").
  for (const n of text.replace(/\b\d{1,2}:\d{2}\b/g, ' ').match(/\$?\d+/g) ?? []) {
    const digits = n.replace('$', '');
    if (terms.numbers.has(digits) && (n.startsWith('$') || Number(digits) > 12)) leaks.push(n);
  }
  return [...new Set(leaks)];
}
