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

export type BusinessUserRoleDto = "owner" | "member";

export type BusinessMembershipDto = {
  businessId: number;
  role: BusinessUserRoleDto;
};

// Bootstrap contract for creating both a business and its first owner login.
export type RegisterBusinessUserRequestDto = {
  email: string;
  password: string;
  displayName?: string;
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
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: AuthUserDto;
};

export type RefreshTokenRequestDto = {
  refreshToken: string;
};

export type LogoutRequestDto = {
  refreshToken: string;
};

export type AdminResetUserPasswordRequestDto = {
  password: string;
};

export type AdminCreateUserRequestDto = {
  email: string;
  password: string;
  displayName?: string;
  platformRole?: PlatformRoleDto;
  businessMemberships?: BusinessMembershipDto[];
};

export type AdminCreateBusinessUserRequestDto = {
  email: string;
  password: string;
  displayName?: string;
  role: BusinessUserRoleDto;
};

export type UpsertBusinessMembershipRequestDto = {
  // Assigning a business without an explicit role makes the user its owner.
  role?: BusinessUserRoleDto;
};

export type BusinessMemberDto = {
  userId: number;
  email: string;
  displayName?: string | null;
  role: BusinessUserRoleDto;
  createdAt: string;
};

export type JwtClaimsDto = {
  userId: number;
  email: string;
  platformRole: PlatformRoleDto;
  businessIds: number[];
  businessMemberships: BusinessMembershipDto[];
};
