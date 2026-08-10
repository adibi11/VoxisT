export type InstagramConfig = { appId: string; appSecret: string; oauthRedirectUri: string; frontendRedirectUri: string; graphApiVersion: string; oauthStateSecret: string; credentialEncryptionKey: string };

export function getInstagramConfig(): InstagramConfig {
  return {
    appId: required("INSTAGRAM_APP_ID"), appSecret: required("INSTAGRAM_APP_SECRET"),
    oauthRedirectUri: required("INSTAGRAM_OAUTH_REDIRECT_URI"), frontendRedirectUri: required("INSTAGRAM_OAUTH_FRONTEND_REDIRECT"),
    graphApiVersion: required("INSTAGRAM_GRAPH_API_VERSION"), oauthStateSecret: required("INSTAGRAM_OAUTH_STATE_SECRET"),
    credentialEncryptionKey: required("INSTAGRAM_INTEGRATION_CREDENTIAL_ENCRYPTION_KEY")
  };
}
function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is not configured`); return value; }