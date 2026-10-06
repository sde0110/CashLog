import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/import/csv';

describe('CSV 내보내기', () => {
  it('수식처럼 보이는 글자는 엑셀이 실행하지 않게 막는다', () => {
    const out = toCsv([['=HYPERLINK("x")', '+1', '-a', '@b', '정상', -5000, 12000]]);
    expect(out).toContain(`"'=HYPERLINK(""x"")"`);
    expect(out).toContain(`'+1,'-a,'@b,정상,-5000,12000`);
  });
});
