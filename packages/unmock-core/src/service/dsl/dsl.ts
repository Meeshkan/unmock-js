import debug from "debug";
import { cloneDeep, defaultsDeep } from "lodash";
import { codeToMedia, mediaTypeToSchema, Schema } from "../interfaces";
import { actors } from "./actors";
import { ITopLevelDSL } from "./interfaces";
import { topTranslators, translators } from "./translators";
import { hasUnmockProperty, injectUnmockProperty } from "./utils";

const debugLog = debug("unmock:dsl");

/**
 * Handles DSL arguments by translating them to OAS where needed.
 * Many of these static functions modify their inputs to abstract away
 * the DSL from the final output (after having it translated/acted upon).
 */
export abstract class DSL {
  /**
   * If true, mismatching arguments will throw
   *    (e.g. `$size: a`, `$size: 0.1` (rounds to 0), `$size: N` with non-array type)
   * If false, these arguments are considered "as if" when they don't match the schema.
   */
  public static STRICT_MODE = true;

  /**
   * Translates DSL instructions in `state` to OAS, based on `schema`.
   * @param state
   * @param schema
   * @returns An object with the translations and a cleaned state without translation-specific keywords
   */
  public static translateDSLToOAS(
    state: any,
    schema: Schema,
  ): { translated: any; cleaned: any } {
    return Object.entries(translators).reduce(
      ({ translated, cleaned }, [property, fn]) => {
        const { [property]: maybeUsed, ...rest } = cleaned;
        const newTranslation =
          maybeUsed !== undefined ? fn(cleaned, schema) : undefined;
        return newTranslation !== undefined
          ? { translated: newTranslation, cleaned: rest }
          : { translated, cleaned };
      },
      { translated: {}, cleaned: state },
    );
  }

  /**
   * Replaces top-level DSL elements in `top` with injected OAS items in every `response` in `responses`.
   * Objects injected are always prefixed with `x-unmock-`, and have a `type` equal to `unmock`, with the
   * relevant value being stored in `default`.
   * @param top
   * @param responses
   */
  public static translateTopLevelToOAS(
    top: ITopLevelDSL,
    responses: codeToMedia | undefined,
  ): codeToMedia | undefined {
    if (responses === undefined) {
      return responses;
    }
    // Handles top-level schema and injects the literals to responses.
    // $code is a special case, handled outside this function (acts as a key and not a value)
    Object.keys(topTranslators)
      .filter(
        dslKey => top[dslKey] !== undefined /* only valid top-level DSL keys */,
      )
      .map(
        dslKey => topTranslators[dslKey](top[dslKey]) /* get the translation */,
      )
      .filter(
        translation =>
          translation !== undefined /* no undefined translations */,
      )
      .forEach(
        translation =>
          injectUnmockProperty(responses, translation) /* add to responses */,
      );
    return responses;
  }

  /**
   * Given a state that potentially contains top level DSL instructions in OAS,
   * acts on those DSL instructions as needed and returns a copy of the given state.
   * The relevant top level DSL instructions are removed from the returned copy.
   * @param states
   */
  public static actTopLevelFromOAS(states: codeToMedia): codeToMedia {
    const act = (mToS: mediaTypeToSchema) =>
      Object.keys(mToS).reduce(
        (obj, mediaType) => ({
          ...obj,
          [mediaType]: actOnSchema(mToS, mediaType),
        }),
        {},
      );

    return Object.keys(states).reduce(
      (obj, code) => ({ ...obj, [code]: act(states[code]) }),
      {},
    );
  }
}

const actOnSchema = (
  schema: mediaTypeToSchema,
  mediaType: string,
): Record<string, Schema> => {
  const [trg, ...rest] = Object.entries(actors).map(([property, fn]) =>
    hasUnmockProperty(schema[mediaType], property)
      ? fn(schema, mediaType)
      : cloneDeep(schema[mediaType]),
  );
  const result = defaultsDeep(trg, rest);

  const maybeProperties = result.properties;
  if (
    maybeProperties !== undefined &&
    Object.keys(maybeProperties).length === 0
  ) {
    debugLog(
      `schema.properties is now empty, removing 'properties' from copied response '${mediaType}'`,
    );
    delete result.properties;
  }

  return result;
};
