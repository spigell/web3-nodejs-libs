import express from 'express';
import { App } from '../app/app';
import { PromClient } from '../prometheus-client/client.js';
import { createMiddleware } from '../logger/middleware.js';

export class Server {
  private server: express.Application;
  private router: express.Router;
  private prom: PromClient;

  constructor(app: App) {
    this.server = express();
    this.router = express.Router();
    this.server.use(express.json());
    this.setHealthz(app);
    this.server.use(createMiddleware(app.logging.getLogger()));

    this.prom = new PromClient();
    this.addMetricsEndpoint(this.prom);
  }

  start(port: number) {
    this.server.use(this.router);
    this.server.listen(port);
  }

  getPrometheusClient(): PromClient {
    return this.prom;
  }

  private addMetricsEndpoint(prom: PromClient) {
    this.router.get('/metrics', (req, res) => {
      prom.getExporter().getMetricsRequestHandler(req, res);
    });
  }

  private setHealthz(app: App) {
    this.router.get('/healthz', async (req, res) => {
      const status = await app.status();

      app.logging.debug('got status', {
        status,
        requestId: req.headers['x-request-id'],
      });

      if (!status.ready) {
        res.status(500).send(status);
        return;
      }

      res.status(200).send(status);
    });
  }
}
