import {
  Addl,
  anyOfKeep,
  anyOfReject,
  Arr,
  changeEnum,
  changeListToTuple,
  changeMaxItems,
  changeMinItems,
  changeRequiredStatus,
  changeSingleSchema,
  changeToConst,
  includeCodes,
  MethodNames,
  oneOfKeep,
  oneOfReject,
  removeCodes,
  responseBody,
} from "openapi-refinements";
export {
  Arr,
  Addl,
} from "openapi-refinements";
import { JSONValue } from "json-schema-strictly-typed";
import { isEqual } from "lodash";
import { Traversal } from "monocle-ts";
import { CodeAsInt, ISerializedRequest, IStateTransformer } from "./interfaces";
import { OpenAPIObject, Reference, Responses, Schema } from "./service/interfaces";

const codeConvert = (c: CodeAsInt | keyof Responses): keyof Responses =>
  `${c}` as (keyof Responses);

const isCodeAsInt = (u: unknown): u is CodeAsInt =>
  typeof u === "number" &&
  new Array(500).fill(null).map((_, i) => i + 100).indexOf(u) !== -1;

const isResponsesKey = (u: unknown): u is keyof Responses =>
  typeof u === "string" &&
    ["default", ...new Array(500).fill(null).map((_, i) => `${i + 100}`)].indexOf(u) !== -1;
function withOrWithoutCodes(
  withOrWithout: boolean,
  codes?: keyof Responses | CodeAsInt | Array<keyof Responses> | CodeAsInt[],
  path?: keyof Responses | CodeAsInt | string | RegExp | boolean,
  method?: keyof Responses | CodeAsInt | MethodNames | MethodNames[] | boolean,
  ...otherCodes: Array<keyof Responses | CodeAsInt>
): (_: ISerializedRequest, o: OpenAPIObject) => OpenAPIObject {
  return (_: ISerializedRequest, o: OpenAPIObject) =>
    (withOrWithout ? includeCodes : removeCodes)(
      path !== undefined && !isResponsesKey(path) && !isCodeAsInt(path)
      ? path : true,
      method !== undefined && !isResponsesKey(method) && !isCodeAsInt(method)
      ? method : true, [
        ...(isResponsesKey(path) ? [path] : isCodeAsInt(path) ? [path] : []),
        ...(isResponsesKey(method) ? [method] : isCodeAsInt(method) ? [method] : []),
        ...(codes instanceof Array ? codes : codes === undefined ? [] : [codes]),
        ...otherCodes].map(i => codeConvert(i)))(o);
}
function withCodes(
  codes: keyof Responses | CodeAsInt | Array<keyof Responses> | CodeAsInt[],
  path?: string | RegExp | boolean,
  method?: MethodNames | MethodNames[] | boolean,
): (_: ISerializedRequest, o: OpenAPIObject) => OpenAPIObject;
function withCodes(
  ...codes: Array<keyof Responses | CodeAsInt>
): (_: ISerializedRequest, o: OpenAPIObject) => OpenAPIObject;
function withCodes(
  codes?: keyof Responses | CodeAsInt | Array<keyof Responses> | CodeAsInt[],
  path?: keyof Responses | CodeAsInt | string | RegExp | boolean,
  method?: keyof Responses | CodeAsInt | MethodNames | MethodNames[] | boolean,
  ...otherCodes: Array<keyof Responses | CodeAsInt>
): (_: ISerializedRequest, o: OpenAPIObject) => OpenAPIObject {
  return withOrWithoutCodes(true, codes, path, method, ...otherCodes);
}
function withoutCodes(
  codes: keyof Responses | CodeAsInt | Array<keyof Responses> | CodeAsInt[],
  path?: string | RegExp | boolean,
  method?: MethodNames | MethodNames[] | boolean,
): (_: ISerializedRequest, o: OpenAPIObject) => OpenAPIObject;
function withoutCodes(
  ...codes: Array<keyof Responses | CodeAsInt>
): (_: ISerializedRequest, o: OpenAPIObject) => OpenAPIObject;
function withoutCodes(
  codes?: keyof Responses | CodeAsInt | Array<keyof Responses> | CodeAsInt[],
  path?: keyof Responses | CodeAsInt | string | RegExp | boolean,
  method?: keyof Responses | CodeAsInt | MethodNames | MethodNames[] | boolean,
  ...otherCodes: Array<keyof Responses | CodeAsInt>
): (_: ISerializedRequest, o: OpenAPIObject) => OpenAPIObject {
  return withOrWithoutCodes(false, codes, path, method, ...otherCodes);
}

interface ISchemaAddress {
  address?: Array<string | number | typeof Arr | typeof Addl>;
}

interface ISchemaChangeOptions extends ISchemaAddress {
  path: string | RegExp | boolean;
  method: MethodNames | MethodNames[] | boolean;
  code: CodeAsInt | keyof Responses | Array<CodeAsInt | keyof Responses> | boolean;
  mediaTypes: boolean | string[];
}

/*
interface IMethodParameterChangeOptions extends ISchemaAddress {
  path?: string | RegExp | boolean;
  method?: MethodNames | MethodNames[] | boolean;
  name: string;
  in: string;
}
*/

type TraversalSignature = [
  string | boolean | RegExp,
  boolean | MethodNames | MethodNames[],
  boolean | Array<(keyof Responses)>,
  boolean | string[]
];

type TraversalFunction<T extends ISchemaAddress> = (options?: T) =>
  (o: OpenAPIObject) =>
  Traversal<OpenAPIObject, Schema | Reference>;

const schemaChangeOptionsToResponseBodySignature = (options?: Partial<ISchemaChangeOptions>): TraversalSignature => [
  options && options.path ? options.path : true,
  options && options.method ? options.method : true,
  options && options.code
    ? typeof options.code === "boolean"
      ? options.code
      : (options.code instanceof Array ? options.code : [options.code]).map(codeConvert)
    : true,
  options && options.mediaTypes
    ? typeof options.mediaTypes === "string"
      ? [options.mediaTypes]
      : options.mediaTypes
    : true,
];

type CurriedTraversal = (
  traversal: (o: OpenAPIObject) =>
    Traversal<OpenAPIObject, Schema | Reference>,
  path: Array<string | number | typeof Arr | typeof Addl>,
) => (o: OpenAPIObject) => OpenAPIObject;

const expandCurriedTraversal =
  <T extends ISchemaAddress>(c: CurriedTraversal, options?: T) =>
  (tf: TraversalFunction<T>) =>
(_: ISerializedRequest, o: OpenAPIObject) =>
  c(
    tf(options),
    options && options.address ? options.address : [],
  )(o);

const makeSchemaTraversalStructure = <T extends ISchemaAddress>(tf: TraversalFunction<T>) => (options?: T) => ({
  const: (j: JSONValue) => expandCurriedTraversal(changeToConst(j), options)(tf),
  minItems: (i: number) => expandCurriedTraversal(changeMinItems(i), options)(tf),
  maxItems: (i: number) => expandCurriedTraversal(changeMaxItems(i), options)(tf),
  required: (prop: string) => expandCurriedTraversal(changeRequiredStatus(prop), options)(tf),
  enumKeep: (vals: any) => expandCurriedTraversal(changeEnum(vals, true), options)(tf),
  enumReject: (vals: any) => expandCurriedTraversal(changeEnum(vals, false), options)(tf),
  anyOfKeep: (indices: number[]) => expandCurriedTraversal(anyOfKeep(indices), options)(tf),
  anyOfReject: (indices: number[]) => expandCurriedTraversal(anyOfReject(indices), options)(tf),
  oneOfKeep: (indices: number[]) => expandCurriedTraversal(oneOfKeep(indices), options)(tf),
  oneOfReject: (indices: number[]) => expandCurriedTraversal(oneOfReject(indices), options)(tf),
  listToTuple: (i: number) => expandCurriedTraversal(changeListToTuple(i), options)(tf),
  schema: (schemaOrFunction: Schema | ((o: OpenAPIObject) => (s: Schema) => Schema)) =>
    expandCurriedTraversal(
      changeSingleSchema(
        typeof schemaOrFunction === "function"
        ? schemaOrFunction
        : (_: OpenAPIObject) => (__: Schema) => schemaOrFunction), options)(tf),
});

export const gen = {
  compose: (...transformers: IStateTransformer[]) =>
    (req: ISerializedRequest, o: OpenAPIObject) => transformers.reduce((a, b) => b(req, a), o),
  noopThrows: (f: IStateTransformer) => (req: ISerializedRequest, o: OpenAPIObject): OpenAPIObject => {
    const out = f(req, o);
    if (isEqual(out, o)) {
      throw Error("Array item setting did not work");
    }
    return out;
  },
  times: (n: number) => (f: IStateTransformer) => {
    const counter = { c: 0 };
    return (req: ISerializedRequest, o: OpenAPIObject): OpenAPIObject => {
      counter.c = counter.c + 1;
      // console.log("CALLING", counter.c, n, req);
      if (counter.c > n) {
        // console.log("WILL NOT INVOKE", f);
        return o;
      }
      // console.log("WILL INVOKE", f);
      return f(req, o);
    }
  },
  withCodes,
  withoutCodes,
  responseBody: makeSchemaTraversalStructure<Partial<ISchemaChangeOptions>>(
    (options?: Partial<ISchemaChangeOptions>) =>
      responseBody(...schemaChangeOptionsToResponseBodySignature(options))),
};
