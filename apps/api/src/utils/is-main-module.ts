import { pathToFileURL } from 'node:url';

export const isMainModule = (moduleUrl: string): boolean => {
  const entrypoint = process.argv[1];

  return entrypoint !== undefined && moduleUrl === pathToFileURL(entrypoint).href;
};
