type BundleMode = 'dev' | 'assets' | 'remote';

function resolveBundleMode(): BundleMode {
  if (__DEV__) return 'dev';
  return 'assets';
}

export const BridgeLib = {
  bundleMode: resolveBundleMode() as BundleMode,
  version: '1.0.0',
} as const;
