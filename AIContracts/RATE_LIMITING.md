# Rate limiting

## Public-entrypoint group

`POST /v1/auth/login`, `POST /v1/auth/register`, and `POST /v1/public/leads`
share one fixed-window budget per client IP address.

| Setting | Default | Environment variable |
| --- | ---: | --- |
| Requests | 20 | `PUBLIC_ENTRYPOINT_RATE_LIMIT_MAX` |
| Window | 15 minutes | `PUBLIC_ENTRYPOINT_RATE_LIMIT_WINDOW_SECONDS` |

The IP comes from `req.ip`, which is safe only because the API trusts exactly
one ALB hop in staging/production. Redis stores an HMAC fingerprint rather than
the raw IP and expires it when the window ends.

On a limit hit, the API returns `429` with `Retry-After` and `RateLimit-*`
headers. If Redis is unavailable, these public routes return `503`; they do not
fail open and allow unrestricted unauthenticated traffic.

`RATE_LIMIT_KEY_SECRET` is required in staging and production. Use a distinct
random secret; it is not a JWT or provider credential. Local development uses a
non-deployment fallback only.
