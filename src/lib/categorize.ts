/** Keyword-based auto-categorization for events and obligations. */

export const EVENT_CATEGORIES = [
  "Social",
  "Recruitment",
  "Brotherhood",
  "Philanthropy",
  "Parents & Alumni",
  "Other",
] as const;

export const EXPENSE_CATEGORIES = [
  "National Fees",
  "Insurance",
  "Housing",
  "Utilities",
  "University Fees",
  "Other",
] as const;

export const INCOME_CATEGORIES = [
  "Fundraising",
  "Donations",
  "University Allocation",
  "Sponsorship",
  "Other",
] as const;

const EVENT_RULES: Array<[RegExp, (typeof EVENT_CATEGORIES)[number]]> = [
  [/rush|recruit|bid\s?day|pref/i, "Recruitment"],
  [/formal|semi|mixer|social|date\s?(party|night)|tailgate|homecoming/i, "Social"],
  [/brotherhood|retreat|initiation|big\s?little|chapter\s?(dinner|night)/i, "Brotherhood"],
  [/philanthropy|charity|fundrais|service|volunteer/i, "Philanthropy"],
  [/parent|alumni|founders/i, "Parents & Alumni"],
];

const EXPENSE_RULES: Array<[RegExp, (typeof EXPENSE_CATEGORIES)[number]]> = [
  [/national|hq|headquarters|chapter\s?fee|ifc|panhellenic/i, "National Fees"],
  [/insurance|liability|risk/i, "Insurance"],
  [/rent|mortgage|house|lease|property/i, "Housing"],
  [/utilit|electric|water|gas|internet|wifi|trash/i, "Utilities"],
  [/university|campus|student\s?org|sga/i, "University Fees"],
];

export function categorizeEvent(name: string): string {
  for (const [re, cat] of EVENT_RULES) if (re.test(name)) return cat;
  return "Other";
}

export function categorizeExpense(name: string): string {
  for (const [re, cat] of EXPENSE_RULES) if (re.test(name)) return cat;
  return "Other";
}

const INCOME_RULES: Array<[RegExp, (typeof INCOME_CATEGORIES)[number]]> = [
  [/fundrais|raffle|car\s?wash|sale|merch|t-?shirt/i, "Fundraising"],
  [/donat|alumni|gift|parent/i, "Donations"],
  [/university|sga|student\s?(gov|org)|allocation|grant/i, "University Allocation"],
  [/sponsor|partner/i, "Sponsorship"],
];

export function categorizeIncome(name: string): string {
  for (const [re, cat] of INCOME_RULES) if (re.test(name)) return cat;
  return "Other";
}
