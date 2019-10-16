import { Backend } from "unmock-core";
import { IInterceptorOptions } from "unmock-core/src/interceptor";
import createFsServiceDefLoader from "./fs-service-def-loader";
import NodeInterceptor from "./interceptor/node-interceptor";
import FSLogger from "./loggers/filesystem-logger";
import FSSnapshotter from "./loggers/snapshotter";

export interface INodeBackendOptions {
  servicesDirectory?: string;
}

/**
 * Node.js backend. Uses Node.js interceptor and loads services from the
 * filesystem at construction.
 */
export default class NodeBackend extends Backend {
  public constructor(config?: INodeBackendOptions) {
    const servicesDirectory = config && config.servicesDirectory;
    const listeners = [
      new FSLogger({
        directory: servicesDirectory,
      }),
      FSSnapshotter.getOrUpdateSnapshotter({}),
    ];
    const serviceDefLoader = createFsServiceDefLoader(servicesDirectory);
    super({
      interceptorFactory: (options: IInterceptorOptions) =>
        new NodeInterceptor(options),
      listeners,
      serviceDefLoader,
    });
  }
}
