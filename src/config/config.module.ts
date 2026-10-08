import { Global, Module } from '@nestjs/common';
import { buildConfig, CONFIG_TOKEN } from './configuration';
import { validateEnv } from './env.validation';

/** Expone la config tipada (CONFIG_TOKEN) a toda la app. */
@Global()
@Module({
  providers: [
    {
      provide: CONFIG_TOKEN,
      useFactory: () => buildConfig(validateEnv(process.env)),
    },
  ],
  exports: [CONFIG_TOKEN],
})
export class AppConfigModule {}
