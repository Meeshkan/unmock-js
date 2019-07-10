/**
 * DSL related parameters that can only be found at the top level
 */
// Defines a mapping for top level DSL keys, to be used with different providers
export const TopLevelDSLKeys: { [DSLKey: string]: string } = {
  $code: "number",
  $times: "number",
} as const;

export interface ITopLevelDSL {
  /**
   * Defines the response based on the requested response code.
   * If the requested response code is not found, returns 'default'
   */
  $code?: number;
  $times?: number;
}

/**
 * DSL related parameters that can be found at any level in the schema
 */

export interface IDSL {
  /**
   * Used to control and generate arrays of specific sizes.
   */
  $size?: number;
  [key: string]: number | string | boolean | undefined;
}
