import type { FastifyInstance, FastifyReply } from 'fastify';
import { DemoInputError, DemoNotReadyError, type DemoService } from './demo-service';

const handleError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof DemoInputError || error instanceof DemoNotReadyError) {
    return reply.status(error.statusCode).send({ error: error.name, message: error.message });
  }
  throw error;
};

export const registerDemoRoutes = (
  server: FastifyInstance,
  demo: DemoService,
  options: { resetEnabled: boolean },
): void => {
  server.get('/demo/state', async (_request, reply) => {
    try {
      return await demo.getState();
    } catch (error) {
      return handleError(reply, error);
    }
  });

  server.post<{ Body: { address: string } }>(
    '/demo/accounts',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['address'],
          properties: { address: { type: 'string', minLength: 1, maxLength: 80 } },
        },
      },
    },
    async (request, reply) => {
      try {
        return await demo.createAccount(request.body.address);
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  server.post<{ Params: { address: string }; Body: { amount_minor: string } }>(
    '/demo/accounts/:address/fund',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['amount_minor'],
          properties: { amount_minor: { type: 'string', pattern: '^[1-9][0-9]*$' } },
        },
      },
    },
    async (request, reply) => {
      try {
        return await demo.fund(request.params.address, request.body.amount_minor);
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  server.post<{ Body: { from: string; to: string; amount_minor: string } }>(
    '/demo/transfers',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'to', 'amount_minor'],
          properties: {
            from: { type: 'string', minLength: 1, maxLength: 80 },
            to: { type: 'string', minLength: 1, maxLength: 80 },
            amount_minor: { type: 'string', pattern: '^[1-9][0-9]*$' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return await demo.transfer(request.body.from, request.body.to, request.body.amount_minor);
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  server.post('/demo/reset', async (_request, reply) => {
    if (!options.resetEnabled) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Route not found' });
    }
    return demo.reset();
  });
};
