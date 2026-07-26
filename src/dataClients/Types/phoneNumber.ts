// Canonical form used to match inbound/outbound addresses against
// BusinessChannel.externalPhoneNumberId: digits only, no "whatsapp:" prefix,
// no "+", spaces, or dashes. "whatsapp:+972-52 1234567" -> "972521234567".
export function normalizePhoneDigits(address: string | null | undefined): string {
    if (!address) {
        return "";
    }

    return address
        .trim()
        .replace(/^whatsapp:/i, "")
        .replace(/\D/g, "");
}
