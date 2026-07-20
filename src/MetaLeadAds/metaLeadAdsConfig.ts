export type MetaLeadAdsConfig = {
    appId: string;
    appSecret: string;
    webhookVerifyToken: string;
    oauthRedirectUri: string;
    graphApiVersion: string;
    oauthStateSecret: string;
    credentialEncryptionKey: string;
};

export function getMetaWebhookConfig(): Pick<MetaLeadAdsConfig, "appSecret" | "webhookVerifyToken"> | null {
    const appSecret = process.env.META_APP_SECRET?.trim();
    const webhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
    return appSecret && webhookVerifyToken ? { appSecret, webhookVerifyToken } : null;
}

export function getMetaLeadAdsConfig(): MetaLeadAdsConfig | null {
    const appId = process.env.META_APP_ID?.trim();
    const appSecret = process.env.META_APP_SECRET?.trim();
    const webhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
    const oauthRedirectUri = process.env.META_OAUTH_REDIRECT_URI?.trim();
    const graphApiVersion = process.env.META_GRAPH_API_VERSION?.trim();
    const oauthStateSecret = process.env.META_OAUTH_STATE_SECRET?.trim();
    const credentialEncryptionKey = process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY?.trim();
    return appId && appSecret && webhookVerifyToken && oauthRedirectUri && graphApiVersion && oauthStateSecret && credentialEncryptionKey
        ? { appId, appSecret, webhookVerifyToken, oauthRedirectUri, graphApiVersion, oauthStateSecret, credentialEncryptionKey }
        : null;
}
