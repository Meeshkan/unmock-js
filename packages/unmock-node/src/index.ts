import { unmock, UnmockOptions } from "unmock-core";
import NodeBackend from "./backend";
import _WinstonLogger from "./logger/winston-logger";

const backend = new NodeBackend();

export const options = new UnmockOptions({ logger: new _WinstonLogger() });

export const on = unmock(options, backend);
export const init = on;
export const initialize = on;
export const off = backend.reset;
