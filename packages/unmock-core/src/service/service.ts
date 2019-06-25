import XRegExp from "xregexp";
import { getAtLevel } from "../util";
import {
  DEFAULT_ENDPOINT,
  DEFAULT_REST_METHOD,
  OAS_PARAMS_KW,
  OAS_PATH_PARAM_REGEXP,
} from "./constants";
import { HTTPMethod, IUnmockServiceState, OASSchema } from "./interfaces";

/**
 * Implements the state management for a service
 */

// TODO: Is there room here for xstate, in the future?
// TODO: Add IService
export class Service {
  // Maintains a state for service
  // First level kv pairs: paths -> methods
  // Second level kv pairs: methods -> status codes
  // Third level kv pairs: status codes -> response template overrides
  // Fourth and beyond: template-specific.
  // @ts-ignore
  private state: IUnmockServiceState = {};
  private hasPaths: boolean = false;

  constructor(private oasSchema: OASSchema, private name: string) {
    // Update the paths in the first level to regex if needed
    if (oasSchema === undefined || oasSchema.paths === undefined) {
      return; // empty schema or does not contain paths
    }
    this.__updateSchemaPaths();
    this.hasPaths = // Find this once, as schema is immutable
      this.schema !== undefined &&
      this.schema.paths !== undefined &&
      Object.keys(this.schema.paths).length > 0;
  }

  get schema(): OASSchema {
    return this.oasSchema;
  }

  get hasDefinedPaths(): boolean {
    return this.hasPaths;
  }

  public findEndpoint(endpoint: string): string | undefined {
    // Finds the endpoint key that matches given endpoint string
    // Iterates over all endpoint until a match is found.
    // String is returned so that matching, reference, etc can be done as needed.
    if (!this.hasDefinedPaths) {
      return;
    }
    for (const endpointRegex in this.schema.paths) {
      if (XRegExp(endpointRegex).test(endpoint)) {
        return endpointRegex;
      }
    }
    return;
  }

  public verifyRequest(method: HTTPMethod, endpoint: string) {
    if (!this.hasDefinedPaths) {
      throw new Error(`'${this.name}' has no defined paths!`);
    }

    if (endpoint !== DEFAULT_ENDPOINT) {
      const servicePaths = this.schema.paths;
      const schemaEndpoint = this.findEndpoint(endpoint);
      console.log(schemaEndpoint);
      if (schemaEndpoint === undefined) {
        // This endpoint does not exist, no need to retain state
        throw new Error(
          `Can't find endpoint '${endpoint}' for '${this.name}'!`,
        );
      }
      if (
        // If the method is 'all', we assume there exists some content under the specified endpoint...
        method !== DEFAULT_REST_METHOD &&
        servicePaths[schemaEndpoint][method] === undefined
      ) {
        // The endpoint exists but the specified method for that endpoint doesnt
        throw new Error(
          `Can't find response for '${method} ${endpoint}' in ${this.name}!`,
        );
      }
    } else if (method !== DEFAULT_REST_METHOD) {
      // If endpoint is default (all), we make sure that at least one path exists with the given method
      if (
        getAtLevel(this.schema.paths, 1, (k: string, _: any) => k === method)
          .length === 0
      ) {
        throw new Error(
          `Can't find any endpoints with method '${method}' in ${this.name}!`,
        );
      }
    }
  }

  public updateState({
    // @ts-ignore
    method,
    // @ts-ignore
    endpoint,
    newState,
  }: {
    method: HTTPMethod;
    endpoint: string;
    newState: IUnmockServiceState;
  }) {
    // Input: method, endpoint, newState
    // Four possible cases:
    // 1. Default endpoint ("**"), default method ("all") =>
    //    applies to all paths with any method where it fits. If none fit -> return false.
    // 2. Default endpoint ("**"), with specific method =>
    //    applies to all paths with that method where it fits. If none fit -> return false.
    // 3. Specific endpoint, default method ("all") =>
    //    applies to all methods in that endpoint, if it fits. If none fit -> return false.
    // 4. Specific endpoint, specific method =>
    //    applies to that combination only. If anything is the state doesn't fit -> return false.
    //

    this.state = newState; // For PR purposes, we just save the state as is.
    return true;
  }

  private __replacePathWithRegexp(newPath: string, oldPath: string) {
    // Replaces oldPath with newPath in this.oasSchema.paths.
    // newPath is treated as Regex pattern.
    const newPathRegex = `^${newPath}$`;
    delete Object.assign(this.oasSchema.paths, {
      [newPathRegex as any]: this.oasSchema.paths[oldPath], // as any is a hack!
    })[oldPath];
  }

  private __updateSchemaPaths() {
    Object.keys(this.schema.paths).forEach((path: string) => {
      const regexResults = OAS_PATH_PARAM_REGEXP.exec(path);
      if (regexResults === null) {
        this.__replacePathWithRegexp(path, path); // Simply convert to direct regexp pattern
        return;
      }
      const pathParameters = regexResults.slice(1); // Get all matches

      const parametersArray = getAtLevel(
        this.schema.paths[path],
        1,
        (k: string, _: any) => k === OAS_PARAMS_KW,
        true, // Get `parameters` object and return its values
      );
      if (parametersArray.length === 0) {
        throw new Error(
          `Found a dynamic path '${path}' but no description for path parameters!`,
        );
      }
      let newPath = `${path}`;
      // Assumption: All methods describe the parameter the same way.
      parametersArray[0].forEach((p: any) => {
        const paramLoc = pathParameters.indexOf(p.name);
        if (p.in === "path" && paramLoc !== -1) {
          // replace the original path with regex as needed
          // for now, we ignore the schema.type and use a generic pattern
          // the pattern is named for later retrieval
          newPath = newPath.replace(`{${p.name}}`, `(?<${p.name}>[^/]+)`);
          pathParameters.splice(paramLoc, 1); // remove from pathParameters after matching
        }
      });
      if (pathParameters.length > 0) {
        // not all elements have been replaced!
        throw new Error(
          `Found a dynamic path '${path}' but the following path parameters have not been described: ${JSON.stringify(
            pathParameters,
          )}!`,
        );
      }
      // Update the content for the new path and remove old path
      this.__replacePathWithRegexp(newPath, path);
    });
  }
}
