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
});
