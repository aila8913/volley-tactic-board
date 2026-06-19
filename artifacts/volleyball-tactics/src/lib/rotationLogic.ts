import { PlayerPosition, Player } from '../types/tactics';

// Standard 5-1 diagonal pairings (always 3 zones apart):
//   S (zone 1)  ↔  OPP (zone 4)
//   OH1 (zone 2) ↔  OH2 (zone 5)
//   MB1 (zone 3) ↔  MB2 (zone 6)
//
// Zone map (our side, bottom half of court):
//   Back row:  5(left) — 6(middle) — 1(right)
//   Front row: 4(left) — 3(middle) — 2(right)
//   Net: top of front row

export function getDefaultPositions(players: Player[], rotation: number): PlayerPosition[] {
  const s   = players.find(p => p.role === 'S1');
  const oh1 = players.find(p => p.role === 'OH1');
  const oh2 = players.find(p => p.role === 'OH2');
  const mb1 = players.find(p => p.role === 'MB1');
  const mb2 = players.find(p => p.role === 'MB2');
  const opp = players.find(p => p.role === 'S2');

  // Rotation 1 starting zones — every pair is exactly 3 zones apart (true diagonal)
  const initialZones = new Map<string, number>();
  if (s)   initialZones.set(s.id,   1);   // S   → back right
  if (oh1) initialZones.set(oh1.id, 2);   // OH1 → front right  (diagonal to OH2)
  if (mb1) initialZones.set(mb1.id, 3);   // MB1 → front middle (diagonal to MB2)
  if (opp) initialZones.set(opp.id, 4);   // OPP → front left   (diagonal to S)
  if (oh2) initialZones.set(oh2.id, 5);   // OH2 → back left    (diagonal to OH1)
  if (mb2) initialZones.set(mb2.id, 6);   // MB2 → back middle  (diagonal to MB1)

  // Pixel coords for each zone (normalised 0-1, our side y=0.5–1.0)
  const zoneCoords: Record<number, { x: number; y: number }> = {
    1: { x: 0.83, y: 0.85 }, // Back right
    2: { x: 0.83, y: 0.60 }, // Front right
    3: { x: 0.50, y: 0.60 }, // Front middle
    4: { x: 0.17, y: 0.60 }, // Front left
    5: { x: 0.17, y: 0.85 }, // Back left
    6: { x: 0.50, y: 0.85 }, // Back middle
  };

  // Clockwise shift: 1→6→5→4→3→2→1
  const shiftSequence = [1, 6, 5, 4, 3, 2];

  const positions: PlayerPosition[] = [];
  for (const player of players) {
    if (player.role === 'L') continue;
    const zone = initialZones.get(player.id) ?? 1;
    const idx  = shiftSequence.indexOf(zone);
    const newZone = shiftSequence[(idx + rotation) % 6];
    const coords  = zoneCoords[newZone];
    positions.push({ playerId: player.id, x: coords.x, y: coords.y });
  }

  return positions;
}
