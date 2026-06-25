import { describe, it, expect } from 'vitest';
import { matchFormSchema } from './match';

const validInput = {
  opponent: '台大',
  dateTime: '2026-06-25T19:00',
  players: [{ name: '小明', number: 7, role: 'S' as const }],
};

describe('matchFormSchema', () => {
  it('接受合法的輸入', () => {
    const result = matchFormSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('沒填對手名稱時會擋下來', () => {
    const result = matchFormSchema.safeParse({ ...validInput, opponent: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('請輸入對手名稱');
    }
  });

  it('球員名單是空陣列時會擋下來', () => {
    const result = matchFormSchema.safeParse({ ...validInput, players: [] });
    expect(result.success).toBe(false);
  });

  it('背號是字串也能通過驗證（模擬 <input type="number"> 給的 DOM 值）', () => {
    const result = matchFormSchema.safeParse({
      ...validInput,
      players: [{ name: '小明', number: '7', role: 'S' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.players[0].number).toBe(7);
    }
  });

  it('背號超過 99 時會擋下來', () => {
    const result = matchFormSchema.safeParse({
      ...validInput,
      players: [{ name: '小明', number: 100, role: 'S' }],
    });
    expect(result.success).toBe(false);
  });
});
