jest.mock('../specs/NativeBridgeModule', () => ({
  sendEvent: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
}));

import { sendToNative } from '../sendToNative';
import NativeBridgeModule from '../specs/NativeBridgeModule';

describe('sendToNative', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('NativeBridgeModule.sendEvent를 이벤트명과 데이터로 호출한다', () => {
    sendToNative('TEST_EVENT', { key: 'value' });
    expect(NativeBridgeModule.sendEvent).toHaveBeenCalledWith('TEST_EVENT', { key: 'value' });
  });

  test('data 미전달 시 빈 객체로 호출한다', () => {
    sendToNative('TEST_EVENT');
    expect(NativeBridgeModule.sendEvent).toHaveBeenCalledWith('TEST_EVENT', {});
  });

  test('typed payload로 sendEvent를 호출한다', () => {
    type Payload = { userId: string; count: number };
    sendToNative<Payload>('LOGIN', { userId: 'abc', count: 1 });
    expect(NativeBridgeModule.sendEvent).toHaveBeenCalledWith('LOGIN', { userId: 'abc', count: 1 });
  });

  test('제네릭 미지정 시 기존 방식과 동일하게 동작한다', () => {
    sendToNative('FALLBACK', { x: 1 });
    expect(NativeBridgeModule.sendEvent).toHaveBeenCalledWith('FALLBACK', { x: 1 });
  });
});
