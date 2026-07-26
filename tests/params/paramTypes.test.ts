import { describe, expect, it } from "vitest";
import {
    BusinessParamType,
    normalizeParamValue,
    parseBusinessParamConfig,
    parseBusinessParamType
} from "../../src/dataClients/Types/paramTypes";

const categorical = {
    id: 1,
    paramName: "City",
    type: BusinessParamType.Categorical,
    config: { options: ["Tel Aviv", "Haifa"] }
};

const continuous = {
    id: 2,
    paramName: "Budget",
    type: BusinessParamType.Continuous,
    config: { min: 0, max: 10000, unit: "ILS" }
};

const time = {
    id: 3,
    paramName: "PreferredDate",
    type: BusinessParamType.Time,
    config: {}
};

describe("normalizeParamValue", () => {
    it("maps categorical values case-insensitively to the canonical option", () => {
        expect(normalizeParamValue(categorical, "tel aviv")).toEqual({
            ok: true,
            type: BusinessParamType.Categorical,
            value: "Tel Aviv"
        });
    });

    it("rejects categorical values outside the option set", () => {
        const result = normalizeParamValue(categorical, "Jerusalem");
        expect(result.ok).toBe(false);
    });

    it("parses continuous values with thousands separators", () => {
        expect(normalizeParamValue(continuous, "1,500")).toEqual({
            ok: true,
            type: BusinessParamType.Continuous,
            value: 1500
        });
    });

    it("rejects continuous values outside the configured bounds", () => {
        expect(normalizeParamValue(continuous, 20000).ok).toBe(false);
        expect(normalizeParamValue(continuous, -5).ok).toBe(false);
    });

    it("rejects non-numeric continuous values instead of storing text", () => {
        expect(normalizeParamValue(continuous, "around two thousand").ok).toBe(false);
    });

    it("normalizes ISO time values to full ISO strings", () => {
        const result = normalizeParamValue(time, "2026-07-28T15:00");
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(new Date(result.value).getTime()).toBe(new Date("2026-07-28T15:00").getTime());
        }
    });

    it("rejects non-ISO time expressions", () => {
        expect(normalizeParamValue(time, "tomorrow afternoon").ok).toBe(false);
    });

    it("rejects empty values for every type", () => {
        expect(normalizeParamValue(categorical, "").ok).toBe(false);
        expect(normalizeParamValue(continuous, null).ok).toBe(false);
        expect(normalizeParamValue(time, undefined).ok).toBe(false);
    });
});

describe("parseBusinessParamType", () => {
    it("falls back to TEXT for unknown types", () => {
        expect(parseBusinessParamType("SOMETHING")).toBe(BusinessParamType.Text);
        expect(parseBusinessParamType(undefined)).toBe(BusinessParamType.Text);
        expect(parseBusinessParamType("CATEGORICAL")).toBe(BusinessParamType.Categorical);
    });
});

describe("parseBusinessParamConfig", () => {
    it("keeps only valid fields", () => {
        expect(parseBusinessParamConfig({
            options: ["A", " B ", "", 3],
            min: 1,
            max: "high",
            unit: " ILS "
        })).toEqual({
            options: ["A", "B"],
            min: 1,
            unit: "ILS"
        });
    });

    it("returns an empty config for non-objects", () => {
        expect(parseBusinessParamConfig(null)).toEqual({});
        expect(parseBusinessParamConfig("x")).toEqual({});
    });
});
