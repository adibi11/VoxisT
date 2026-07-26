// Typed business parameters: every value the LLM collects is normalized into a
// fixed, ML-ready value space (categorical / continuous / time) so answers can
// be learned from directly without per-business data cleaning.

export enum BusinessParamType {
    Categorical = "CATEGORICAL",
    Continuous = "CONTINUOUS",
    Time = "TIME",
    // Reserved for legacy parameters and the system "Name" parameter.
    Text = "TEXT"
}

export type BusinessParamConfig = {
    // CATEGORICAL: closed set of allowed values.
    options?: string[];
    // CONTINUOUS: optional inclusive bounds and a display unit.
    min?: number;
    max?: number;
    unit?: string;
};

export type BusinessParamDefinition = {
    id: number;
    paramName: string;
    type: BusinessParamType;
    config: BusinessParamConfig;
};

export type NormalizedParamValue =
    | { ok: true; type: BusinessParamType.Categorical; value: string }
    | { ok: true; type: BusinessParamType.Continuous; value: number }
    | { ok: true; type: BusinessParamType.Time; value: string } // ISO 8601
    | { ok: true; type: BusinessParamType.Text; value: string }
    | { ok: false; reason: string };

export function parseBusinessParamType(value: unknown): BusinessParamType {
    if (Object.values(BusinessParamType).includes(value as BusinessParamType)) {
        return value as BusinessParamType;
    }

    return BusinessParamType.Text;
}

export function parseBusinessParamConfig(value: unknown): BusinessParamConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    const record = value as Record<string, unknown>;
    const config: BusinessParamConfig = {};

    if (Array.isArray(record.options)) {
        config.options = record.options
            .filter((option): option is string => typeof option === "string" && option.trim().length > 0)
            .map((option) => option.trim());
    }

    if (typeof record.min === "number" && Number.isFinite(record.min)) {
        config.min = record.min;
    }

    if (typeof record.max === "number" && Number.isFinite(record.max)) {
        config.max = record.max;
    }

    if (typeof record.unit === "string" && record.unit.trim()) {
        config.unit = record.unit.trim();
    }

    return config;
}

// The single normalization gate for LLM-collected values. Values that do not
// map cleanly into the parameter's value space are rejected, never coerced
// into free text.
export function normalizeParamValue(
    definition: BusinessParamDefinition,
    rawValue: string | number | null | undefined
): NormalizedParamValue {
    if (rawValue === null || rawValue === undefined || String(rawValue).trim() === "") {
        return { ok: false, reason: "empty_value" };
    }

    switch (definition.type) {
        case BusinessParamType.Categorical:
            return normalizeCategorical(definition, String(rawValue));
        case BusinessParamType.Continuous:
            return normalizeContinuous(definition, rawValue);
        case BusinessParamType.Time:
            return normalizeTime(String(rawValue));
        case BusinessParamType.Text:
            return { ok: true, type: BusinessParamType.Text, value: String(rawValue).trim() };
    }
}

function normalizeCategorical(definition: BusinessParamDefinition, rawValue: string): NormalizedParamValue {
    const options = definition.config.options || [];
    if (options.length === 0) {
        return { ok: false, reason: "categorical_options_missing" };
    }

    const normalized = rawValue.trim().toLowerCase();
    const match = options.find((option) => option.toLowerCase() === normalized);
    if (!match) {
        return { ok: false, reason: "categorical_value_not_in_options" };
    }

    // Always store the canonical option spelling, not the user's variant.
    return { ok: true, type: BusinessParamType.Categorical, value: match };
}

function normalizeContinuous(
    definition: BusinessParamDefinition,
    rawValue: string | number
): NormalizedParamValue {
    const value = typeof rawValue === "number"
        ? rawValue
        : Number(rawValue.trim().replace(/,/g, ""));

    if (!Number.isFinite(value)) {
        return { ok: false, reason: "continuous_value_not_numeric" };
    }

    const { min, max } = definition.config;
    if (min !== undefined && value < min) {
        return { ok: false, reason: "continuous_value_below_min" };
    }

    if (max !== undefined && value > max) {
        return { ok: false, reason: "continuous_value_above_max" };
    }

    return { ok: true, type: BusinessParamType.Continuous, value };
}

function normalizeTime(rawValue: string): NormalizedParamValue {
    const trimmed = rawValue.trim();
    // Require an ISO 8601 shape (the prompt instructs the LLM to resolve
    // relative expressions like "tomorrow afternoon" before emitting).
    if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/.test(trimmed)) {
        return { ok: false, reason: "time_value_not_iso8601" };
    }

    const parsed = new Date(trimmed);
    if (!Number.isFinite(parsed.getTime())) {
        return { ok: false, reason: "time_value_invalid" };
    }

    return { ok: true, type: BusinessParamType.Time, value: parsed.toISOString() };
}

// Human-readable spec line used both in prompts and owner-facing validation errors.
export function describeParamDefinition(definition: BusinessParamDefinition): string {
    switch (definition.type) {
        case BusinessParamType.Categorical:
            return `${definition.paramName} (categorical; allowed values: ${(definition.config.options || []).join(" | ") || "none configured"})`;
        case BusinessParamType.Continuous: {
            const bounds: string[] = [];
            if (definition.config.min !== undefined) bounds.push(`min ${definition.config.min}`);
            if (definition.config.max !== undefined) bounds.push(`max ${definition.config.max}`);
            const unit = definition.config.unit ? ` in ${definition.config.unit}` : "";
            return `${definition.paramName} (number${unit}${bounds.length ? "; " + bounds.join(", ") : ""})`;
        }
        case BusinessParamType.Time:
            return `${definition.paramName} (date/time; emit ISO 8601, e.g. 2026-07-28T15:00)`;
        case BusinessParamType.Text:
            return `${definition.paramName} (free text)`;
    }
}
