jest.mock('../specs/NativeBridgeModule', () => ({
  __esModule: true,
  default: {
    sendEvent: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    popToNative: jest.fn(),
  },
}));

import { popToNative } from '../popToNative';
import NativeBridgeModule from '../specs/NativeBridgeModule';

describe('popToNative', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('NativeBridgeModule.popToNative()를 호출한다', () => {
    popToNative();
    expect(NativeBridgeModule.popToNative).toHaveBeenCalledTimes(1);
  });

  test('인자 없이 호출된다', () => {
    popToNative();
    expect(NativeBridgeModule.popToNative).toHaveBeenCalledWith();
  });
});
