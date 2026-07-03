export const CLIENT_NAME_PARAM = "Name";
export const CLIENT_NAME_NOT_PROVIDED = "not provided";

export type CollectedParams = Record<string, string | number | null>;

export function isClientNameParam(paramName: string): boolean {
    return paramName.trim().toLowerCase() === "name";
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
