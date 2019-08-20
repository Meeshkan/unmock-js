import Ajv from "ajv";
import debug from "debug";
import { ISerializedRequest } from "../../interfaces";
import { DSL, filterTopLevelDSL, getTopLevelDSL, ITopLevelDSL } from "../dsl";
import {
  isSchema,
  IStateInputGenerator,
  Schema,
  UnmockServiceState,
} from "../interfaces";
import { IValidationError } from "./interfaces";

// These are specific to OAS and not part of json schema standard
const ajv = new Ajv({ unknownFormats: ["int32", "int64"] });

const debugLog = debug("unmock:state:transformers");

const genBuilder = (
  fn: () => Record<string, Schema>,
): { spreadState: Record<string, Schema>; error?: string } => {
  try {
    return { spreadState: fn() };
  } catch (err) {
    return { spreadState: {}, error: err.message };
  }
};

export const TEXT_RESPONSE_ERROR =
  "Can't set text response for non-string schemas";

export const objResponse = (
  state?: UnmockServiceState,
): IStateInputGenerator => ({
  isEmpty: state === undefined || Object.keys(state).length === 0,
  top: getTopLevelDSL(state || {}),
  gen: (schema: Schema) =>
    genBuilder(() => {
      const spread = spreadStateFromService(
        schema,
        filterTopLevelDSL(state || {}),
      );
      const missingParam = DFSVerifyNoneAreNull(spread);
      if (missingParam !== undefined) {
        throw new Error(missingParam.msg);
      }
      return spread;
    }),
  state,
});

export const functionResponse = (
  responseFunction: (sreq: ISerializedRequest, scm?: Schema) => any,
  dsl?: ITopLevelDSL,
): IStateInputGenerator => ({
  isEmpty: responseFunction === undefined,
  top: getTopLevelDSL((dsl || {}) as UnmockServiceState),
  gen: (schema: Schema) =>
    genBuilder(
      () =>
        ({
          "x-unmock-function": (req: ISerializedRequest) =>
            responseFunction(req, schema),
        } as any),
    ),
  state: responseFunction.toString(),
});

export const textResponse = (
  state?: string,
  dsl?: ITopLevelDSL,
): IStateInputGenerator => ({
  isEmpty: typeof state !== "string" || state.length === 0,
  top: getTopLevelDSL((dsl || {}) as UnmockServiceState),
  gen: (schema: Schema) =>
    genBuilder(() => generateTextResponse(schema, state)),
  state,
});

const generateTextResponse = (
  schema: Schema,
  state: string | undefined,
): Record<string, any> => {
  debugLog(
    `generateTextResponse: Verifying ${schema} can contain a simple string`,
  );
  if (state === undefined || schema === undefined || schema.type !== "string") {
    throw new Error(TEXT_RESPONSE_ERROR);
  }
  return { ...schema, const: state };
};

/**
 * Matches between partial `state` and `schema` when given `key` is missing in `schema`,
 * by traversing `schema` if possible. If traversal is not possible, a value of `null` is assigned to given `key`.
 * @param schema
 * @param state
 * @param key
 */
const matchWhenMissingKey = (schema: any, state: any, key: string) => {
  if (hasNoNestedItems(schema)) {
    // Option 1a: no matching key and no traversal to go through - the key is missing
    return { [key]: null };
  }
  debugLog(`matchWhenMissingKey: traversing nested items for ${key}`);
  // Option 1b: current schema has no matching key, but contains indirection (items/properties, etc)
  // `statePath` at this point may also contain DSL elements, so we parse them before moving onwards
  const { translated, cleaned } = DSL.translateDSLToOAS(state, schema);
  const spread = {
    ...oneLevelOfIndirectNestedness(schema, cleaned),
    ...translated,
  };
  if (Object.keys(spread).length === 0) {
    spread[key] = null;
  }
  return spread;
};

/**
 * Matches between partial `state` and `schema` when given `state[key]` is a concrete value.
 * Validates `state[key]` against `schema[key]`. If validation fails, a value of `null` is assigned to given `key`.
 * @param schema
 * @param state
 * @param key
 */
const matchWithConcreteValue = (schema: any, value: any, key: string) => ({
  [key]:
    isSchema(schema) && ajv.validate(schema, value)
      ? { ...schema, const: value }
      : typeof value === "function"
      ? { ...schema, "x-unmock-function": value }
      : null,
});

/**
 * Matches between partial `state` and `schema` when given `state[key]` is not a concrete value.
 * Traverses both `state[key]` and `state` to further match.
 * If traversal is not possible, a value of `null` is assigned to given `key`.
 * @param schema
 * @param state
 * @param key
 */
const matchWithNonConcreteValue = (schema: any, state: any, key: string) => {
  const stateValue = state[key]; // assumed to exist
  if ([undefined, null].includes(stateValue)) {
    throw new Error(
      `${key} in '${JSON.stringify(state)}' is undefined or null!`,
    );
  }
  if (hasNoNestedItems(schema) && isEmptyObject(schema)) {
    debugLog(
      `matchWithNonConcreteValue: but more traversal is needed and not possible -> missing value found`,
    );
    // Option 3: Current schema has matching key, but state specifies an object and schema has final value
    return { [key]: null };
  }

  debugLog(
    `matchWithNonConcreteValue: traversing ${JSON.stringify(
      schema,
    )} and ${JSON.stringify(stateValue)}`,
  );
  // Option 4: Current scheme has matching key, state specifies an object - traverse schema and indirection
  // `stateValue` at this point may also contain DSL elements, so we parse them before moving onwards
  const { translated, cleaned } = DSL.translateDSLToOAS(stateValue, schema);
  const spread = {
    [key]: {
      ...spreadStateFromService(schema, cleaned),
      ...translated,
    },
  };
  return oneLevelOfIndirectNestedness(schema, state, spread);
};

/**
 * Given a state request, finds the matching objects
 * within the schema that apply to the request. These
 * are fetched so that one can use the spread operator
 * to overwrite the default schema.
 * The state items are matched by identifying all corresponding
 * keys nested in the path leading to them.
 *
 * @param statePath A state being set in a service (or recursively-called, hence `any`)
 * @param serviceSchema The top-level (or recursely-called, hence `any`) schema for the service
 * @returns An object with string-keys leading to the location of matching state for each variable,
 *          with value being either the Schema defined for that variable, or null.
 * @throws  If a state path is defined in such a way, that the nested state isn't an object, string,
 *          number or boolean (i.e. `{ path: { to: { state: undefined } } }` )
 */
const spreadStateFromService = (
  serviceSchema: any,
  statePath: any,
): { [pathKey: string]: any | null } => {
  debugLog(
    `spreadStateFromService: Looking to match ${JSON.stringify(
      statePath,
    )} in ${JSON.stringify(serviceSchema)}`,
  );

  return Object.keys(statePath)
    .map(key => {
      debugLog(
        `spreadStateFromService: traversing the given state, looking to match ${key}`,
      );
      const scm = serviceSchema[key];
      const stateValue = statePath[key];
      return scm === undefined
        ? matchWhenMissingKey(serviceSchema, statePath, key)
        : isConcreteValue(stateValue)
        ? matchWithConcreteValue(scm, stateValue, key)
        : matchWithNonConcreteValue(scm, statePath, key);
    })
    .reduce((obj, el) => ({ ...obj, ...el }), {});
};

// Items that hold nested contents in OAS
const NESTED_SCHEMA_ITEMS = ["properties", "items", "additionalProperties"];

const hasNoNestedItems = (obj: any) =>
  NESTED_SCHEMA_ITEMS.every((key: string) => obj[key] === undefined);

const isConcreteValue = (obj: any) =>
  ["string", "number", "boolean", "function"].includes(typeof obj);

const isEmptyObject = (obj: any) =>
  typeof obj !== "object" || Object.keys(obj).length === 0;

const oneLevelOfIndirectNestedness = (
  schema: any,
  path: any,
  internalObj: { [key: string]: any } = {},
) =>
  NESTED_SCHEMA_ITEMS.reduce((o, key) => {
    if (schema[key] === undefined) {
      return o;
    }
    const maybeContents = spreadStateFromService(schema[key], path);
    const hasContents =
      maybeContents !== undefined &&
      Object.keys(maybeContents).length > 0 &&
      Object.keys(maybeContents).every(
        (k: string) => maybeContents[k] !== null,
      );
    return { ...o, ...(hasContents ? { [key]: maybeContents } : {}) };
  }, internalObj);

/**
 * Recursively iterates over given `obj` and verifies all values are
 * properly defined.
 * @param obj Object to iterate over
 * @param prevPath (Used internaly) tracked the path to the key that might
 *                 be undefined.
 * @return An IMissingParam if some missing parameter is found, or undefined if no parameters are missing.
 */
const DFSVerifyNoneAreNull = (
  obj: any,
  nestedLevel: number = 0,
): IValidationError | undefined => {
  if (obj === undefined) {
    return undefined;
  }
  for (const key of Object.keys(obj)) {
    if (obj[key] === null) {
      return {
        msg: `Can't find definition for '${key}', or its type is incorrect`,
        nestedLevel,
      };
    }
    if (typeof obj[key] === "object") {
      return DFSVerifyNoneAreNull(obj[key], nestedLevel + 1);
    }
  }
  return undefined;
};
