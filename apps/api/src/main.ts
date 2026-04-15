import { buildApp } from './app';

async function bootstrap(): Promise<void> {
  const app = await buildApp();
  const { PORT, HOST } = app.config;
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`api listening http://${HOST}:${PORT}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
