import { Request, Response, NextFunction } from 'express';
import * as uuid from 'uuid';
import winston from 'winston';

export function createMiddleware(logger: winston.Logger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || uuid.v4();
    req.headers['x-request-id'] = requestId;

    const { method, url } = req;
    const startTime = Date.now();

    // Log the incoming request
    logger.debug(`Incoming request`, { url, method, requestId });

    // Log the response details after it is finished
    res.on('finish', () => {
      const { statusCode } = res;
      const responseTime = Date.now() - startTime;
      logger.info(`Processed request`, {
        url,
        method,
        requestId,
        responseTime,
        statusCode,
      });
    });

    next();
  };
}
