import winston, { Logger, createLogger, format, transports } from 'winston';
import { randomBytes } from 'crypto';

const timestampFormat = 'MMM-DD-YYYY HH:mm:ss';

const generateLogId = (): string => randomBytes(16).toString('hex');

export class Logging {
  private logger: Logger;

  constructor(level: string = 'info') {
    this.logger = createLogger({
      level: level,
      format: format.combine(
        format.timestamp({ format: timestampFormat }),
        format.json(),
        format.printf(({ timestamp, level, message, ...data }) => {
          const response = {
            timestamp,
            level,
            message,
            data: Object.keys(data).length ? data : undefined,
            logId: generateLogId(),
          };
          return JSON.stringify(response);
        }),
      ),
      transports: [new transports.Console()],
    });
  }

  getLogger(): winston.Logger {
    return this.logger;
  }

  debug(message: string, meta: object = {}): void {
    this.logger.debug(message, meta);
  }

  info(message: string, meta: object = {}): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta: object = {}): void {
    this.logger.warn(message, meta);
  }

  error(message: string, meta: object = {}): void {
    this.logger.error(message, meta);
  }
}
