// Contract used by the UI to request a JWT for an existing business user.
export type LoginRequestDto = {
  email: string;
  password: string;
};

export type RegisterBusinessRequestDto = {
  name: string;
  phone: string;
  email: string;
  parameters: {
    paramName: string;
    paramValue?: string;
  }[];
  starterMessage: string;
  endMessage: string;
  escalationMessage: string;
  language?: string;
};

export type PlatformRoleDto = "admin" | "user";

export type BusinessUserRoleDto = "owner" | "admin" | "member";

export type BusinessMembershipDto = {
  businessId: number;
  role: BusinessUserRoleDto;
};

// Bootstrap contract for creating both a business and its first owner login.
export type RegisterBusinessUserRequestDto = {
  email: string;
  password: string;
  displayName?: string;
  platformRole?: PlatformRoleDto;
  business: RegisterBusinessRequestDto;
};

// User data intentionally excludes password/hash fields.
export type AuthUserDto = {
  id: number;
  email: string;
  displayName?: string | null;
  platformRole: PlatformRoleDto;
  businessIds: number[];
  businessMemberships: BusinessMembershipDto[];
};

// Returned after login/register so the UI can store the JWT and render the current user.
export type AuthResponseDto = {
  token: string;
  user: AuthUserDto;
};

export type AdminResetUserPasswordRequestDto = {
  password: string;
};

export type JwtClaimsDto = {
  userId: number;
  email: string;
  platformRole: PlatformRoleDto;
  businessIds: number[];
  businessMemberships: BusinessMembershipDto[];
};
