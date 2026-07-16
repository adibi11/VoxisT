# API v1 Access Contract

All API endpoints are served below `/v1`. JWTs contain `platformRole`, `businessIds`, and `businessMemberships`, where each membership contains a `businessId` and a role of `owner` or `member`.

## Access matrix

| Resource | Platform admin | Business owner | Business member |
| --- | --- | --- | --- |
| Leads, clients, conversations | All businesses | Own businesses | Own businesses |
| Response metrics | All businesses | Own businesses | Own businesses |
| Business settings and channels | All businesses | Own businesses | Blocked |
| Business context | All businesses | Own businesses | Blocked |
| Follow-up policy, state, and schedules | All businesses | Own businesses | Blocked |
| Business member list | All businesses | Own businesses | Own businesses |
| Create users and assign memberships | Allowed | Blocked | Blocked |

Platform admins bypass business membership checks. Membership changes are reflected in newly issued JWTs, so a user must log in again after an admin changes their businesses or roles.

## Mobile sessions

- `POST /v1/auth/login` and registration return a short-lived access token, its expiry, a rotating refresh token, its expiry, and the current user.
- `POST /v1/auth/refresh` consumes the current refresh token and returns a replacement access/refresh token pair. A refresh token can be consumed only once.
- `POST /v1/auth/logout` revokes the supplied refresh token and is idempotent.
- `GET /v1/me` returns fresh user and membership data using the access token.

Access tokens default to 15 minutes and refresh tokens default to 30 days. Configure them with `ACCESS_TOKEN_TTL_SECONDS` and `REFRESH_TOKEN_TTL_SECONDS`.

## Administration

- `POST /v1/admin/businesses/:businessId/users` creates an `AppUser` and its owner/member association with that existing business in one operation.
- `POST /v1/admin/users` creates an `AppUser`. Optional `businessMemberships` may create owner/member assignments in the same request.
- `PUT /v1/admin/users/:userId/businesses/:businessId` creates or updates a membership. Omitting `role` defaults to `owner`.
- `DELETE /v1/admin/users/:userId/businesses/:businessId` removes a membership.
- `GET /v1/admin/users` lists users and their memberships.
- `GET /v1/admin/businesses` lists businesses.

Only platform admins can use these routes. Public business registration always creates a platform `user`; callers cannot create platform admins through registration.

## Business members

- `GET /v1/businesses/:businessId/members` is available to every user with access to the business so the team can assign leads.

The response includes `userId`, `email`, `displayName`, membership `role`, and `createdAt`.

## Lead assignment

Lead assignment is not accepted through the generic lead patch. All business team members use dedicated atomic commands:

- `POST /v1/businesses/:businessId/leads/:leadId/claim` claims an unassigned lead for the authenticated user.
- `POST /v1/businesses/:businessId/leads/:leadId/assign` accepts `memberId` and the currently observed `expectedMemberId`.
- `POST /v1/businesses/:businessId/leads/:leadId/unassign` accepts the currently observed `expectedMemberId`.
- Owners and members may assign and unassign leads for team collaboration.
- Assigning a user who is not a member of the business is rejected.
- A stale expected assignee returns `409` with the current lead, so clients must refresh rather than overwrite another user’s change.

## v1 infrastructure endpoints

- Health: `GET /v1/health`
- Messaging webhook: `POST /v1/webhook/:businessId`
