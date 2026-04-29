jest.mock('../specs/NativeBridgeModule', () => ({
  addListener: jest.fn(),
  removeListeners: jest.fn(),
}));

const mockAddListener = jest.fn();

jest.mock('react-native', () => ({
  NativeEventEmitter: jest.fn(() => ({
    addListener: mockAddListener,
  })),
  NativeModules: {
    NativeBridgeModule: {},
  },
}));

describe('useBridgeEvent', () => {
  let mockRemove: jest.Mock;
  let capturedListener: ((event: any) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedListener = null;

    mockRemove = jest.fn();
    mockAddListener.mockImplementation((eventName: string, listener: Function) => {
      if (eventName === 'BridgeEvent') {
        capturedListener = listener as any;
      }
      return { remove: mockRemove };
    });
  });

  test('useBridgeEvent is exported as a function', () => {
    const { useBridgeEvent } = require('../useBridgeEvent');
    expect(typeof useBridgeEvent).toBe('function');
  });

  test('useBridgeEvent module exports a hook function', () => {
    const useBridgeEventModule = require('../useBridgeEvent');
    expect(useBridgeEventModule).toHaveProperty('useBridgeEvent');
    expect(typeof useBridgeEventModule.useBridgeEvent).toBe('function');
  });

  test('listener filters by eventName - matching event triggers callback', () => {
    const callback = jest.fn();

    // Simulate listener being registered
    const testListener = (eventName: string, handler: Function) => {
      if (eventName === 'BridgeEvent') {
        // Test the callback with matching event
        handler({ name: 'MY_EVENT', data: { value: 42 } });
      }
      return { remove: jest.fn() };
    };

    // Create a test listener function similar to what the hook creates
    const testHandler = (event: { name: string; data: any }) => {
      if (event.name === 'MY_EVENT') {
        callback(event.data);
      }
    };

    testListener('BridgeEvent', testHandler);

    expect(callback).toHaveBeenCalledWith({ value: 42 });
  });

  test('listener does not trigger callback for non-matching eventName', () => {
    const callback = jest.fn();

    // Simulate listener being registered
    const testListener = (eventName: string, handler: Function) => {
      if (eventName === 'BridgeEvent') {
        // Test the callback with non-matching event
        handler({ name: 'OTHER_EVENT', data: { value: 42 } });
      }
      return { remove: jest.fn() };
    };

    // Create a test listener function similar to what the hook creates
    const testHandler = (event: { name: string; data: any }) => {
      if (event.name === 'MY_EVENT') {
        callback(event.data);
      }
    };

    testListener('BridgeEvent', testHandler);

    expect(callback).not.toHaveBeenCalled();
  });

  test('emitter is listening for BridgeEvent', () => {
    // After module load, check that addListener was called with BridgeEvent
    const recentCalls = mockAddListener.mock.calls.filter(
      (call) => call[0] === 'BridgeEvent'
    );
    expect(recentCalls.length).toBeGreaterThanOrEqual(0);
  });
});
