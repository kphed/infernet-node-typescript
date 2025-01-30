import * as dotenv from 'dotenv';

dotenv.config();

import Fastify from 'fastify';
import main from './main';

const fastify = Fastify({
  logger: true,
});

fastify.listen({ port: parseInt(process.env.PORT ?? '3000') }, async (err) => {
  if (err) throw err;

  try {
    await main();
  } catch (err) {
    console.error(err);
  }
});
