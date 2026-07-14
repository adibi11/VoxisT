import {
    BusinessChannelDto,
    UpsertBusinessChannelRequestDto
} from "../../../../contracts";

export interface IBusinessChannelRepository {
    GetChannelsByBusinessId(businessId: number): Promise<BusinessChannelDto[]>;
    UpsertChannelByBusinessId(businessId: number, channelDto: UpsertBusinessChannelRequestDto): Promise<BusinessChannelDto>;
}
