export type DocumentLanguage = "he" | "en";

export const EXTRACTION_PROMPT_VERSION = "document-extraction-v2";
export const CLASSIFICATION_PROMPT_VERSION = "inbound-classification-v2";

export function documentLanguageFromBusiness(value: string): DocumentLanguage {
  return value.trim().toLowerCase() === "he" ? "he" : "en";
}

export function extractionInstructions(language: DocumentLanguage): string {
  return [...COMMON_EXTRACTION_RULES, ...LANGUAGE_EXTRACTION_RULES[language]].join(" ");
}

export function classificationInstructions(language: DocumentLanguage): string {
  return [...COMMON_CLASSIFICATION_RULES, ...LANGUAGE_CLASSIFICATION_RULES[language]].join(" ");
}

const COMMON_EXTRACTION_RULES = [
  "Extract only values visibly supported by the supplied document; never infer or fabricate missing values.",
  "First verify that the document semantically matches the expected document type.",
  "Use each field's label, description, aliases, format hint, and examples when supplied; labels are semantic identifiers and need not appear verbatim.",
  "EXTRACTED means the value is clearly visible and attributable to that exact field.",
  "MISSING means the requested field or value is not present in the document.",
  "NEEDS_REVIEW means a possible value is ambiguous, partially illegible, conflicting, or cannot be confidently attributed to the requested field.",
  "Do not use EXTRACTED merely because a plausible nearby value exists.",
  "If the document does not match, return null/MISSING for every field.",
  "For TEXT, preserve the visible textual value unless the field metadata explicitly requests another representation.",
  "For DATE, normalize a clearly identified date to ISO YYYY-MM-DD.",
  "For NUMBER and CURRENCY, return the numeric value without currency symbols or grouping separators.",
  "For BOOLEAN, return a JSON boolean matching the semantic value visible in the document.",
  "Do not normalize a value except as required by its field type; when typed normalization is uncertain, return null/NEEDS_REVIEW.",
  "Return only valid JSON conforming to the provided schema."
];

const COMMON_CLASSIFICATION_RULES = [
  "Classify the supplied document against only the supplied case requirement candidates.",
  "Use candidate document type, schema name, category, and requirement label semantically; do not extract or return field values.",
  "HIGH means exactly one candidate is an unambiguous semantic match for both document type and any slot, period, or qualifier in its label.",
  "A generally financial-looking document is not sufficient for HIGH confidence.",
  "If the document type, period, slot, or candidate is ambiguous, return a null ID with MEDIUM or LOW confidence.",
  "Return only valid JSON conforming to the provided schema."
];

const HEBREW_RTL_RULES = [
  "The document is expected primarily in Hebrew and Hebrew is read right-to-left.",
  "Visual tables may place labels to the right of their values, and content may mix Hebrew, English, and numbers.",
  "Do not reverse Hebrew character order.",
  "Recognize configured Hebrew aliases and abbreviations when they are semantically equivalent.",
  "Israeli dates commonly use DD/MM/YYYY and may use Hebrew month names.",
  'Currency may appear as ₪, ש״ח, ש"ח, NIS, or ILS; grouping and decimal separators depend on the visible presentation.',
  "Parentheses or a minus sign may denote negative amounts."
];

const LANGUAGE_EXTRACTION_RULES: Record<DocumentLanguage, string[]> = {
  he: [
    ...HEBREW_RTL_RULES,
    "In payslips, carefully distinguish concepts such as ברוטו, נטו, חייב במס, ניכויים, לתשלום, סה״כ, and שכר יסוד; configured field metadata remains authoritative.",
    "In bank statements, distinguish transaction amount, debit, credit, current balance, opening balance, and closing balance.",
    "Do not treat an arbitrary monetary value as satisfying a requested currency field."
  ],
  en: [
    "The document is expected primarily in English with left-to-right layouts, but it may contain mixed-language names, labels, or values.",
    "Use common English financial terminology semantically while keeping configured field metadata authoritative.",
    "In financial tables, distinguish transaction amount, debit, credit, balances, gross amounts, net amounts, deductions, and totals; do not substitute a nearby monetary value."
  ]
};

const LANGUAGE_CLASSIFICATION_RULES: Record<DocumentLanguage, string[]> = {
  he: [
    ...HEBREW_RTL_RULES,
    "Semantically distinguish common Israeli financial document types and Hebrew date or period qualifiers.",
    "Do not return HIGH merely because Hebrew financial terminology or monetary values are present."
  ],
  en: [
    "The document is expected primarily in English with left-to-right layouts, but mixed-language content is allowed.",
    "Semantically distinguish common English financial document types and date or period qualifiers."
  ]
};
