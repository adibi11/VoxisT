import {
    BusinessSettingsParameterDto,
    UpsertBusinessParameterRequestDto
} from "../../../../contracts";

export interface IBusinessParameterRepository {
    UpsertParameterByBusinessId(businessId: number, request: UpsertBusinessParameterRequestDto): Promise<BusinessSettingsParameterDto>;
}
