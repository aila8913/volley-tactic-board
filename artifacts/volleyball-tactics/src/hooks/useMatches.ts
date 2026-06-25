import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Match, MatchFormValues, MatchPlayer } from '../types/match';

interface MatchesStore {
  matches: Match[];
  addMatch: (values: MatchFormValues, tournamentId: string | null) => string;
  updateMatch: (id: string, values: MatchFormValues) => void;
  deleteMatch: (id: string) => void;
}

// 編輯時表單帶著既有球員的 id（保留身份），新增的球員列沒有 id，這裡統一補上。
function toMatchPlayers(players: MatchFormValues['players']): MatchPlayer[] {
  return players.map((p) => ({ id: p.id ?? uuidv4(), name: p.name, number: p.number, role: p.role }));
}

export const useMatches = create<MatchesStore>()(
  persist(
    (set) => ({
      matches: [],

      addMatch: (values, tournamentId) => {
        const id = uuidv4();
        const newMatch: Match = {
          id,
          opponent: values.opponent,
          dateTime: values.dateTime,
          players: toMatchPlayers(values.players),
          createdAt: new Date().toISOString(),
          tournamentId,
        };
        set((state) => ({ matches: [...state.matches, newMatch] }));
        return id;
      },

      updateMatch: (id, values) => set((state) => ({
        matches: state.matches.map((m) => m.id === id
          ? {
              ...m,
              opponent: values.opponent,
              dateTime: values.dateTime,
              players: toMatchPlayers(values.players),
            }
          : m),
      })),

      deleteMatch: (id) => set((state) => ({
        matches: state.matches.filter((m) => m.id !== id),
      })),
    }),
    {
      name: 'volleyboard_matches',
      partialize: (state) => ({ matches: state.matches }),
    }
  )
);
