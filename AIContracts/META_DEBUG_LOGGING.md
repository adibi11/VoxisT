# Temporary Meta discovery diagnostics

Remove the `TEMP_META_DEBUG` diagnostics after ngrok testing. They exist only to identify the stage at which a Page/form stops appearing.

| Event | Meaning | Logged data |
| --- | --- | --- |
| `meta.debug.oauth.credentialsStored` | OAuth callback saved a replacement credential set | Voxis IDs only |
| `meta.debug.resources.requested` | UI started a resource refresh | Voxis IDs only |
| `meta.debug.discovery.accounts.*` | `/me/accounts` began/completed | counts and Page fingerprints only |
| `meta.debug.discovery.forms.*` | One Page form lookup completed/failed | counts, fingerprints, Graph error metadata only |
| `meta.debug.resources.returned` | Backend returned the UI resource response | counts only |
| `meta.debug.subscription.*` | UI selected a form and backend persisted it | Voxis IDs and fingerprints only |
| `metaLeadAds.webhook.unresolved` | Webhook did not match an active subscription | fingerprints only |

The diagnostics never log OAuth codes, access tokens, encrypted credentials, raw Meta IDs, Page/form names, lead values, or raw Meta payloads.
