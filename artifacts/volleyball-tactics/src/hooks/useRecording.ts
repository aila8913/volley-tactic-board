import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MatchRecordingState, PointRecord, Side, SetRecordingState } from "../types/recording";

interface RecordingStore {
  // 用 matchId 當 key，這樣每場比賽的比分/輪轉是分開存的，跟 useMatches 用陣列存比賽列表不同，
  // 這裡用物件存是因為查特定一場的記錄比「列出所有場」更常用，物件用 id 查比陣列 find 快也好寫。
  recordingsByMatch: Record<string, MatchRecordingState>;
  startSet: (matchId: string, servingFirst: Side) => void;
  // meta 是快速操作手勢（畫線連到球員→選動作→選得失分）帶來的附加資訊，純記錄用，
  // 不影響比分/輪轉怎麼算——所以舊的「按按鈕得分」呼叫方式（不傳 meta）一樣能用。
  scorePoint: (
    matchId: string,
    side: Side,
    meta?: Pick<PointRecord, "action" | "touchedBy">,
  ) => void;
  undoLastPoint: (matchId: string) => void;
  nextSet: (matchId: string) => void;
}

const makeEmptySet = (setNumber: number): SetRecordingState => ({
  setNumber,
  ourScore: 0,
  opponentScore: 0,
  serving: null,
  ourRotation: 0,
  opponentRotation: 0,
  history: [],
});

const getOrInitRecord = (
  byMatch: Record<string, MatchRecordingState>,
  matchId: string,
): MatchRecordingState => byMatch[matchId] ?? { currentSet: makeEmptySet(1), completedSets: [] };

export const useRecording = create<RecordingStore>()(
  persist(
    (set) => ({
      recordingsByMatch: {},

      startSet: (matchId, servingFirst) =>
        set((state) => {
          const record = getOrInitRecord(state.recordingsByMatch, matchId);
          return {
            recordingsByMatch: {
              ...state.recordingsByMatch,
              [matchId]: { ...record, currentSet: { ...record.currentSet, serving: servingFirst } },
            },
          };
        }),

      scorePoint: (matchId, side, meta) =>
        set((state) => {
          const record = getOrInitRecord(state.recordingsByMatch, matchId);
          const current = record.currentSet;
          if (current.serving === null) return state;

          // 排球輪轉規則：只有原本沒發球的一方贏得這一分（side-out，奪回發球權）才會輪轉；
          // 發球方自己再得分只加分、不輪轉——輪轉永遠發生在「剛拿到發球權」的那一刻。
          // 我方、對手各自獨立輪轉，互不影響。
          const wasSideOut = side !== current.serving;
          const ourRotation =
            wasSideOut && side === "us" ? (current.ourRotation + 1) % 6 : current.ourRotation;
          const opponentRotation =
            wasSideOut && side === "opponent"
              ? (current.opponentRotation + 1) % 6
              : current.opponentRotation;

          return {
            recordingsByMatch: {
              ...state.recordingsByMatch,
              [matchId]: {
                ...record,
                currentSet: {
                  ...current,
                  ourScore: side === "us" ? current.ourScore + 1 : current.ourScore,
                  opponentScore:
                    side === "opponent" ? current.opponentScore + 1 : current.opponentScore,
                  serving: side,
                  ourRotation,
                  opponentRotation,
                  history: [...current.history, { side, wasSideOut, ...meta }],
                },
              },
            },
          };
        }),

      undoLastPoint: (matchId) =>
        set((state) => {
          const record = state.recordingsByMatch[matchId];
          const current = record?.currentSet;
          if (!current || current.history.length === 0) return state;
          const last = current.history[current.history.length - 1];

          const ourRotation =
            last.wasSideOut && last.side === "us"
              ? (current.ourRotation + 5) % 6
              : current.ourRotation;
          const opponentRotation =
            last.wasSideOut && last.side === "opponent"
              ? (current.opponentRotation + 5) % 6
              : current.opponentRotation;
          // side-out 前的發球方，跟這次得分方剛好相反；如果這分沒有 side-out，
          // 發球方本來就跟得分方相同，復原後維持不變。
          const previousServing: Side = last.wasSideOut
            ? last.side === "us"
              ? "opponent"
              : "us"
            : last.side;

          return {
            recordingsByMatch: {
              ...state.recordingsByMatch,
              [matchId]: {
                ...record,
                currentSet: {
                  ...current,
                  ourScore: last.side === "us" ? current.ourScore - 1 : current.ourScore,
                  opponentScore:
                    last.side === "opponent" ? current.opponentScore - 1 : current.opponentScore,
                  serving: previousServing,
                  ourRotation,
                  opponentRotation,
                  history: current.history.slice(0, -1),
                },
              },
            },
          };
        }),

      nextSet: (matchId) =>
        set((state) => {
          const record = getOrInitRecord(state.recordingsByMatch, matchId);
          const finished = record.currentSet;
          return {
            recordingsByMatch: {
              ...state.recordingsByMatch,
              [matchId]: {
                completedSets: [
                  ...record.completedSets,
                  {
                    setNumber: finished.setNumber,
                    ourScore: finished.ourScore,
                    opponentScore: finished.opponentScore,
                  },
                ],
                currentSet: makeEmptySet(finished.setNumber + 1),
              },
            },
          };
        }),
    }),
    { name: "volleyboard_recording" },
  ),
);
