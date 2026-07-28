import { BusinessParamDefinition, BusinessParamType } from "./paramTypes";

export const CLIENT_NAME_PARAM = "Name";
export const CLIENT_NAME_NOT_PROVIDED = "not provided";

export type CollectedParams = Record<string, string | number | null>;

// Not a real BusinessParameter row - collecting the client's name is a
// product default, not something owners configure (there is no UI to
// configure a TEXT-typed parameter). id 0 marks it as synthetic.
export const CLIENT_NAME_PARAM_DEFINITION: BusinessParamDefinition = {
    id: 0,
    paramName: CLIENT_NAME_PARAM,
    type: BusinessParamType.Text,
    config: {}
};

export function isClientNameParam(paramName: string): boolean {
    return paramName.trim().toLowerCase() === "name";
}

// Guarantees a name slot exists regardless of business configuration, without
// duplicating it if the business already has its own name-like parameter row.
export function ensureClientNameParamName(paramNames: string[]): string[] {
    return paramNames.some(isClientNameParam) ? paramNames : [...paramNames, CLIENT_NAME_PARAM];
}

export function ensureClientNameParamDefinition(definitions: BusinessParamDefinition[]): BusinessParamDefinition[] {
    return definitions.some((definition) => isClientNameParam(definition.paramName))
        ? definitions
        : [...definitions, CLIENT_NAME_PARAM_DEFINITION];
}

export function findClientNameParamKey(params: CollectedParams): string | undefined {
    return Object.keys(params).find(isClientNameParam);
}

export function ensureClientNameParam(params: CollectedParams): void {
    if (!findClientNameParamKey(params)) {
        params[CLIENT_NAME_PARAM] = null;
    }
}

export function getClientNameParamValue(params: CollectedParams): string | null {
    const key = findClientNameParamKey(params);
    if (!key) return null;

    const value = params[key];
    if (value === null || value === undefined) return null;

    const normalizedValue = value.toString().trim();
    return normalizedValue === "" ? null : normalizedValue;
}

export function fillMissingClientNameParam(params: CollectedParams): string {
    const key = findClientNameParamKey(params) || CLIENT_NAME_PARAM;
    const currentValue = getClientNameParamValue(params);
    params[key] = currentValue || CLIENT_NAME_NOT_PROVIDED;
    return params[key].toString();
}
