import * as dotenv from 'dotenv';

dotenv.config();

import Fastify from 'fastify';

const fastify = Fastify({
  logger: true,
});

fastify.listen({ port: parseInt(process.env.PORT ?? '3000') }, (err) => {
  if (err) throw err;
});
