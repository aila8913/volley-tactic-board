import { PlayerPosition, Player } from '../types/tactics';

// Returns default positions for rotation 1
// Court is 0 to 1 in both x and y. Net is at y = 0.5. Our side is y = 0.5 to 1.0.
export function getDefaultPositions(players: Player[], rotation: number): PlayerPosition[] {
  // rotation is 0 to 5, corresponding to standard rotation 1 to 6
  // Rotation 1 standard positions on court (bottom side):
  // Front: 4 (left), 3 (middle), 2 (right)
  // Back: 5 (left), 6 (middle), 1 (right)
  
  // Find which player has which role to start in rotation 1
  const s = players.find(p => p.role === 'S');
  const oh1 = players.find(p => p.role === 'OH1');
  const oh2 = players.find(p => p.role === 'OH2');
  const mb1 = players.find(p => p.role === 'MB1');
  const mb2 = players.find(p => p.role === 'MB2');
  const opp = players.find(p => p.role === 'OPP');

  // Initial zones (1-indexed, standard)
  const initialZones = new Map<string, number>();
  if (s) initialZones.set(s.id, 1);
  if (oh1) initialZones.set(oh1.id, 4);
  if (oh2) initialZones.set(oh2.id, 5);
  if (mb1) initialZones.set(mb1.id, 3);
  if (mb2) initialZones.set(mb2.id, 6);
  if (opp) initialZones.set(opp.id, 2);

  const zoneCoords = {
    1: { x: 0.83, y: 0.85 }, // Right Back
    2: { x: 0.83, y: 0.6 },  // Right Front
    3: { x: 0.5, y: 0.6 },   // Middle Front
    4: { x: 0.17, y: 0.6 },  // Left Front
    5: { x: 0.17, y: 0.85 }, // Left Back
    6: { x: 0.5, y: 0.85 }   // Middle Back
  };

  const positions: PlayerPosition[] = [];

  for (const player of players) {
    if (player.role === 'L') continue; // Libero doesn't have a default starting position in the array this way
    let zone = initialZones.get(player.id) || 1;
    
    // Shift clockwise by 'rotation' amount
    // Order: 1 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1
    // Actually, rotation means shifting zones. Rotation 2: 1 moves to 6, 6 moves to 5, etc.
    // Standard clockwise: 1->6, 6->5, 5->4, 4->3, 3->2, 2->1
    const shiftSequence = [1, 6, 5, 4, 3, 2];
    const currentIndex = shiftSequence.indexOf(zone);
    const newIndex = (currentIndex + rotation) % 6;
    const newZone = shiftSequence[newIndex];

    const coords = zoneCoords[newZone as keyof typeof zoneCoords];
    
    positions.push({
      playerId: player.id,
      x: coords.x,
      y: coords.y
    });
  }

  return positions;
}
