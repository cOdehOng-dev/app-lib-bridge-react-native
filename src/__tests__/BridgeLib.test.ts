import { BridgeLib } from '../BridgeLib';

describe('BridgeLib', () => {
  test('bundleMode는 테스트 환경에서 dev이다', () => {
    expect(BridgeLib.bundleMode).toBe('dev');
  });

  test('version이 정의되어 있다', () => {
    expect(typeof BridgeLib.version).toBe('string');
  });
});
