# Meta multi-Page and multi-form connection contract

One Meta integration connection represents one authorized Meta account. A connection may have many selected Page/form subscriptions.

## Refresh available resources

`GET /v1/businesses/:businessId/integrations/:connectionId/meta/resources`

This is a live Meta refresh. It uses the saved OAuth user token to call Meta for the Pages the user can currently access, then loads each Page's forms. It does not return Page access tokens.

Response:

```json
{
  "pages": [{ "id": "page-1", "name": "Main Page", "forms": [{ "id": "form-1", "name": "Quote request" }] }],
  "subscriptions": [{ "id": 41, "pageId": "page-1", "pageName": "Main Page", "formId": "form-1", "formName": "Quote request", "status": "ACTIVE" }],
  "warnings": []
}
```

Use `subscriptions` to mark connected forms. A newly granted Page or newly created form appears after this endpoint is called again; OAuth is not repeated unless the saved user token lacks access or has expired.

## Add a form

`POST /v1/businesses/:businessId/integrations/:connectionId/meta/subscriptions`

```json
{ "pageId": "page-1", "formId": "form-2" }
```

The server revalidates that the Page/form is visible through Meta, stores the Page token server-side, subscribes the app to `leadgen` for that Page when this is its first selected form, and activates the form subscription.

## Remove a form

`DELETE /v1/businesses/:businessId/integrations/:connectionId/meta/subscriptions/:subscriptionId`

The server disables that form. If it was the last active form for its Page, it also unsubscribes the Meta app from that Page.

## Disconnect Meta

`POST /v1/businesses/:businessId/integrations/:connectionId/disable`

This removes Meta Page subscriptions, disables all form subscriptions, clears encrypted Meta credentials, and marks the parent connection disabled. Existing Voxis leads remain available.

## UI behavior

- Show a **Refresh Pages & forms** button after OAuth completes and whenever the settings screen opens.
- Render each Page and its forms as selectable checkboxes; allow multiple selections across Pages.
- Use **Connect form** / **Remove form** per form rather than a single Page/form selector.
- Show Page-specific warnings returned by the refresh endpoint without hiding the other Pages.
- Require a confirmation dialog before disconnecting the entire Meta connection.
