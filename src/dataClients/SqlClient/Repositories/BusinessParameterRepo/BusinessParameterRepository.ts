import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import {
    BusinessParameterConfigDto,
    BusinessParameterTypeDto,
    BusinessSettingsParameterDto,
    UpsertBusinessParameterRequestDto
} from "../../../../contracts";
import { isClientNameParam } from "../../../Types/clientNameParam";
import { IBusinessParameterRepository } from "./IBusinessParameterRepository";

export class BusinessParameterRepository implements IBusinessParameterRepository {
    constructor(private readonly prisma: PrismaClient) {}

    async UpsertParameterByBusinessId(
        businessId: number,
        request: UpsertBusinessParameterRequestDto
    ): Promise<BusinessSettingsParameterDto> {
        const paramName = request.paramName.trim();
        const paramType = normalizeParameterType(paramName, request.paramType);
        const config = normalizeParameterConfig(paramName, paramType, request.config);
        const data = {
            paramName,
            use: request.use ?? true,
            paramType,
            config: config === null ? Prisma.JsonNull : toPrismaJson(config)
        };

        if (request.id !== undefined) {
            const existing = await this.prisma.businessParameter.findFirst({
                where: { id: request.id, businessId },
                select: { id: true }
            });
            if (!existing) {
                throw new Error(`Business parameter ${request.id} does not belong to business ${businessId}`);
            }
            return mapParameter(await this.prisma.businessParameter.update({
                where: { id: request.id },
                data
            }));
        }

        return mapParameter(await this.prisma.businessParameter.upsert({
            where: { businessId_paramName: { businessId, paramName } },
            create: { businessId, ...data },
            update: data
        }));
    }
}

function normalizeParameterType(paramName: string, requestedType?: BusinessParameterTypeDto): BusinessParameterTypeDto {
    if (isClientNameParam(paramName)) return "TEXT";
    if (!requestedType || requestedType === "TEXT") {
        throw new Error(`Parameter "${paramName}" must declare paramType CATEGORICAL, CONTINUOUS, or TIME`);
    }
    return requestedType;
}

function normalizeParameterConfig(
    paramName: string,
    paramType: BusinessParameterTypeDto,
    requestedConfig?: BusinessParameterConfigDto | null
): BusinessParameterConfigDto | null {
    const config = requestedConfig || {};
    if (paramType === "CATEGORICAL") {
        const options = (config.options || []).map((option) => option.trim()).filter(Boolean);
        if (options.length < 2 || options.length > 30) {
            throw new Error(`Categorical parameter "${paramName}" requires 2-30 options`);
        }
        if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
            throw new Error(`Categorical parameter "${paramName}" has duplicate options`);
        }
        return { options };
    }
    if (paramType === "CONTINUOUS") {
        if (config.min !== undefined && config.max !== undefined && config.min >= config.max) {
            throw new Error(`Continuous parameter "${paramName}" requires min < max`);
        }
        return {
            ...(config.min !== undefined ? { min: config.min } : {}),
            ...(config.max !== undefined ? { max: config.max } : {}),
            ...(config.unit?.trim() ? { unit: config.unit.trim() } : {})
        };
    }
    return null;
}

function mapParameter(parameter: {
    id: number;
    paramName: string;
    use: boolean;
    paramType: string;
    config: Prisma.JsonValue | null;
}): BusinessSettingsParameterDto {
    return {
        id: parameter.id,
        paramName: parameter.paramName,
        use: parameter.use,
        paramType: parameter.paramType as BusinessParameterTypeDto,
        config: parameter.config as BusinessParameterConfigDto | null,
        paramValue: null
    };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
