import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerRouting } from '@angular/ssr';
import { appConfig } from './app.config';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    provideServerRouting(serverRoutes),
    provideClientHydration(withEventReplay())
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
