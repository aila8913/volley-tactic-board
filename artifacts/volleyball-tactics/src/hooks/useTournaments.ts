import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { Tournament, TournamentFormValues } from '../types/tournament';

interface TournamentsStore {
  tournaments: Tournament[];
  addTournament: (values: TournamentFormValues) => string;
  updateTournament: (id: string, values: TournamentFormValues) => void;
  deleteTournament: (id: string) => void;
}

// 跟 useMatches.ts 是兩個獨立的 store，故意不互相 import 對方的 actions——
// 「刪除資料夾時要連同裡面的比賽一起刪除」這種跨 store 的邏輯，交給呼叫的元件處理
// (同時讀兩個 store，自己把每一步串起來)，每個 store 只管好自己的資料就好。
export const useTournaments = create<TournamentsStore>()(
  persist(
    (set) => ({
      tournaments: [],

      addTournament: (values) => {
        const id = uuidv4();
        const newTournament: Tournament = {
          id,
          name: values.name,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ tournaments: [...state.tournaments, newTournament] }));
        return id;
      },

      updateTournament: (id, values) => set((state) => ({
        tournaments: state.tournaments.map((t) => t.id === id ? { ...t, name: values.name } : t),
      })),

      deleteTournament: (id) => set((state) => ({
        tournaments: state.tournaments.filter((t) => t.id !== id),
      })),
    }),
    {
      name: 'volleyboard_tournaments',
      partialize: (state) => ({ tournaments: state.tournaments }),
    }
  )
);
