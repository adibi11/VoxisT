# VoxisT UI Authorization Contract

This document describes how the React UI should interpret authentication and authorization data from the API.

## Core Rules

- The JWT is used by the UI for navigation, page gating, and request authentication.
- The API still enforces authorization server-side on every protected route.
- UI checks are for user experience only; they are not the security boundary.
- Protected API calls must send:

```http
Authorization: Bearer <jwt>
```

## Roles

### Platform Role

Platform role controls global application access.

```ts
type PlatformRoleDto = "admin" | "user";
```

- `admin`: internal/platform admin. Can access global admin dashboards and cross-business views.
- `user`: regular application user. Can access only businesses where they have membership.

### Business Role

Business role controls permissions inside a specific business.

```ts
type BusinessUserRoleDto = "owner" | "admin" | "member";
```

- `owner`: full business-level control.
- `admin`: business management role.
- `member`: operational role with limited access.

## Auth DTOs

### `BusinessMembershipDto`

```ts
type BusinessMembershipDto = {
  businessId: number;
  role: BusinessUserRoleDto;
};
```

### `AuthUserDto`

```ts
type AuthUserDto = {
  id: number;
  email: string;
  displayName?: string | null;
  platformRole: PlatformRoleDto;
  businessIds: number[];
  businessMemberships: BusinessMembershipDto[];
};
```

### `JwtClaimsDto`

JWT claims use the same authorization shape needed by the UI.

```ts
type JwtClaimsDto = {
  userId: number;
  email: string;
  platformRole: PlatformRoleDto;
  businessIds: number[];
  businessMemberships: BusinessMembershipDto[];
};
```

## UI Routing Rules

### Platform Admin Pages

Require:

```ts
user.platformRole === "admin"
```

Examples:

- global businesses dashboard
- all conversations dashboard
- internal analytics
- future platform user management

### Business Pages

Require one of:

```ts
user.platformRole === "admin"
```

or:

```ts
user.businessIds.includes(businessId)
```

Examples:

- business conversations
- clients
- conversation details

### Business Management Pages

Require one of:

```ts
user.platformRole === "admin"
```

or matching membership role:

```ts
["owner", "admin"].includes(membership.role)
```

Examples:

- business context settings
- future business settings
- future business user management

## Endpoints

### Register Business And Owner User

```http
POST /auth/register
```

Request includes optional `platformRole`.

```ts
type RegisterBusinessUserRequestDto = {
  email: string;
  password: string;
  displayName?: string;
  platformRole?: PlatformRoleDto;
  business: RegisterBusinessRequestDto;
};
```

Response:

```ts
AuthResponseDto
```

UI behavior:

- Store `token`.
- Store `user`.
- If `user.platformRole === "admin"`, route to platform admin dashboard.
- Otherwise route to business dashboard.

### Login

```http
POST /auth/login
```

Response:

```ts
AuthResponseDto
```

UI behavior is the same as registration.

### Get Current User Businesses

```http
GET /me/businesses
```

Auth: required.

Use for regular business dashboard scoping.

### Platform Admin: Get All Businesses

```http
GET /admin/businesses
```

Auth: required. Requires:

```ts
user.platformRole === "admin"
```

Response:

```ts
BusinessSummaryDto[]
```

Use for the platform admin dashboard business list.

Status codes:

- `200` success
- `401` missing/invalid token
- `403` platform admin access required
- `500` fetch failed

## Recommended UI Guards

```ts
function isPlatformAdmin(user: AuthUserDto): boolean {
  return user.platformRole === "admin";
}

function getBusinessMembership(user: AuthUserDto, businessId: number): BusinessMembershipDto | undefined {
  return user.businessMemberships.find((membership) => membership.businessId === businessId);
}

function canAccessBusiness(user: AuthUserDto, businessId: number): boolean {
  return isPlatformAdmin(user) || Boolean(getBusinessMembership(user, businessId));
}

function canManageBusiness(user: AuthUserDto, businessId: number): boolean {
  const membership = getBusinessMembership(user, businessId);
  return isPlatformAdmin(user) || membership?.role === "owner" || membership?.role === "admin";
}
```

## Server-Side Expectations

The UI may hide pages and buttons based on JWT role data, but every protected API endpoint must still validate authorization on the server.

The API currently treats platform admin as global business access. Regular users are scoped by `businessIds` and `businessMemberships`.
