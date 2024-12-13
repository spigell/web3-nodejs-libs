import { Logging } from '../logger/logger.js';

export type Status = {
  ready: boolean;
  error: string;
};

export interface App {
  logging: Logging;
  status(): Promise<Status>;
}

const appVersion = process.env.npm_package_version;

export function appInfo() {
  return {
    appVersion,
    environment: process.env.NODE_ENV,
    proccessId: process.pid,
  };
}
