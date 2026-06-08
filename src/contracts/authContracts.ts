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
