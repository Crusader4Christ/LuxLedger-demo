import type { ApplicationServices } from '@luxledger/core/application';

type Service = ApplicationServices[keyof ApplicationServices];

interface DomainErrorLike {
  code: string;
  httpStatus: number;
  message: string;
}

const isClientDomainError = (value: unknown): value is DomainErrorLike =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  typeof (value as { code: unknown }).code === 'string' &&
  'message' in value &&
  typeof (value as { message: unknown }).message === 'string' &&
  'httpStatus' in value &&
  typeof (value as { httpStatus: unknown }).httpStatus === 'number' &&
  (value as { httpStatus: number }).httpStatus >= 400 &&
  (value as { httpStatus: number }).httpStatus < 500;

const findClientDomainCause = (error: unknown): DomainErrorLike | null => {
  let current = error;
  const visited = new Set<unknown>();

  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);

    if (isClientDomainError(current)) {
      return current;
    }

    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }

  return null;
};

const restoreServiceDomainErrors = <T extends Service>(service: T): T =>
  new Proxy(service, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== 'function') {
        return value;
      }

      return async (...args: unknown[]) => {
        try {
          return await Reflect.apply(value, target, args);
        } catch (error) {
          const domainCause = findClientDomainCause(error);
          throw domainCause ?? error;
        }
      };
    },
  });

// @luxledger/postgres-adapter@0.1.2 can wrap a client domain error as a repository
// error when DomainError arrives through a different public core export. Preserve
// the adapter's 5xx shielding, but restore a structurally valid 4xx domain cause.
export const restoreAdapterDomainErrors = (services: ApplicationServices): ApplicationServices =>
  Object.fromEntries(
    Object.entries(services).map(([name, service]) => [
      name,
      restoreServiceDomainErrors(service as Service),
    ]),
  ) as unknown as ApplicationServices;
