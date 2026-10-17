export const migrationHistoryMatches = (appliedHashes, expectedHashes) =>
  appliedHashes.length <= expectedHashes.length &&
  appliedHashes.every((hash, index) => hash === expectedHashes[index]);

export const npmExecutable = (platform = process.platform) =>
  platform === 'win32' ? 'npm.cmd' : 'npm';
