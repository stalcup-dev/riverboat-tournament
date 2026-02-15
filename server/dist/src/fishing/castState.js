export function beginCast(player, hotspotId) {
    player.cast_state = "CASTING";
    player.cast_hotspot_id = hotspotId;
    player.cast_offer_id = "";
    player.cast_expires_ms = 0;
    player.cast_seq += 1;
}
export function createBiteOffer(player, issuedServerMs, offerWindowMs) {
    if (!player.cast_hotspot_id) {
        return null;
    }
    const offerId = `offer_${player.id}_${player.cast_seq}`;
    const expiresMs = issuedServerMs + offerWindowMs;
    player.cast_state = "OFFERED";
    player.cast_offer_id = offerId;
    player.cast_expires_ms = expiresMs;
    return {
        offer_id: offerId,
        player_id: player.id,
        hotspot_id: player.cast_hotspot_id,
        issued_server_ms: issuedServerMs,
        expires_server_ms: expiresMs
    };
}
