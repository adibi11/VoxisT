import { IInboundEmailRepository } from "./inboundEmailTypes";
import { generateInboundEmailToken } from "./inboundEmailToken";

export class CaseInboundEmailService {
  constructor(private readonly repository: IInboundEmailRepository, private readonly domain: string) {}

  async getOrCreateAddress(businessId: number, caseId: number): Promise<string | null> {
    const token = await this.repository.getOrCreateCaseToken(
      businessId,
      caseId,
      generateInboundEmailToken
    );
    return token ? `case-${token}@${this.domain}` : null;
  }
}
