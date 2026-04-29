import React from 'react';
import { act, create } from 'react-test-renderer';

let capturedListener: ((event: { name: string; data: Record<string, unknown> }) => void) | null = null;
const mockSubscriptionRemove = jest.fn();

jest.mock('react-native', () => ({
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn((_: string, listener: (event: { name: string; data: Record<string, unknown> }) => void) => {
      capturedListener = listener;
      return { remove: mockSubscriptionRemove };
    }),
  })),
  NativeModules: {
    NativeBridgeModule: {},
  },
  useEffect: jest.requireActual('react').useEffect,
  useRef: jest.requireActual('react').useRef,
}));

jest.mock('../specs/NativeBridgeModule', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

import { useBridgeEvent } from '../useBridgeEvent';
import NativeBridgeModule from '../specs/NativeBridgeModule';

const mockAddListener = NativeBridgeModule.addListener as jest.Mock;
const mockRemoveListeners = NativeBridgeModule.removeListeners as jest.Mock;

function Wrapper({ eventName, callback }: { eventName: string; callback: (data: Record<string, unknown>) => void }) {
  useBridgeEvent(eventName, callback);
  return null;
}

describe('useBridgeEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedListener = null;
    mockSubscriptionRemove.mockClear();
  });

  test('구독 시 NativeBridgeModule.addListener를 BridgeEvent로 호출한다', () => {
    act(() => {
      create(React.createElement(Wrapper, { eventName: 'MY_EVENT', callback: jest.fn() }));
    });
    expect(mockAddListener).toHaveBeenCalledWith('BridgeEvent');
  });

  test('eventName이 일치할 때 callback을 data와 함께 호출한다', () => {
    const callback = jest.fn();
    act(() => {
      create(React.createElement(Wrapper, { eventName: 'MY_EVENT', callback }));
    });

    act(() => {
      capturedListener!({ name: 'MY_EVENT', data: { key: 'value' } });
    });

    expect(callback).toHaveBeenCalledWith({ key: 'value' });
  });

  test('eventName이 다르면 callback을 호출하지 않는다', () => {
    const callback = jest.fn();
    act(() => {
      create(React.createElement(Wrapper, { eventName: 'MY_EVENT', callback }));
    });

    act(() => {
      capturedListener!({ name: 'OTHER_EVENT', data: {} });
    });

    expect(callback).not.toHaveBeenCalled();
  });

  test('unmount 시 subscription을 해제하고 removeListeners를 호출한다', () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(React.createElement(Wrapper, { eventName: 'MY_EVENT', callback: jest.fn() }));
    });

    act(() => {
      renderer.unmount();
    });

    expect(mockSubscriptionRemove).toHaveBeenCalled();
    expect(mockRemoveListeners).toHaveBeenCalledWith(1);
  });
});
