// Contract used by the UI to request a JWT for an existing business user.
export type LoginRequestDto = {
  email: string;
  password: string;
};

// Temporary bootstrap contract for creating a business-scoped user while the UI/admin flow is still young.
export type RegisterBusinessUserRequestDto = {
  email: string;
  password: string;
  displayName?: string;
  businessId: number;
};

// User data intentionally excludes password/hash fields.
export type AuthUserDto = {
  id: number;
  email: string;
  displayName?: string | null;
  businessIds: number[];
};

// Returned after login/register so the UI can store the JWT and render the current user.
export type AuthResponseDto = {
  token: string;
  user: AuthUserDto;
};

export type JwtClaimsDto = {
  userId: number;
  email: string;
  businessIds: number[];
};
