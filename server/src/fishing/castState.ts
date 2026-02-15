export interface CastStatePlayer {
  id: string;
  cast_state: "IDLE" | "CASTING" | "OFFERED" | "COOLDOWN";
  cast_hotspot_id: string;
  cast_offer_id: string;
  cast_expires_ms: number;
  cast_seq: number;
}

export interface BiteOfferSnapshot {
  offer_id: string;
  player_id: string;
  hotspot_id: string;
  issued_server_ms: number;
  expires_server_ms: number;
}

export function beginCast(player: CastStatePlayer, hotspotId: string): void {
  player.cast_state = "CASTING";
  player.cast_hotspot_id = hotspotId;
  player.cast_offer_id = "";
  player.cast_expires_ms = 0;
  player.cast_seq += 1;
}

export function createBiteOffer(
  player: CastStatePlayer,
  issuedServerMs: number,
  offerWindowMs: number
): BiteOfferSnapshot | null {
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
