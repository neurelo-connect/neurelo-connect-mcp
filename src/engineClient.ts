/**
 * Engine client module for interacting with the Neurelo Connect backend.
 * Provides a typed client for making API requests to execute workflows and queries.
 */

import { AxiosError, type AxiosPromise } from "axios";
import { DefaultApiFactory } from "./openapi/api";
import { Configuration } from "./openapi/configuration";
type Json = JsonObject | JsonArray | string | number | boolean | null;
type JsonObject = { [key: string]: Json };
type JsonArray = Json[];
import { version } from "../package.json";

// Type definitions for OpenAPI client
type RawOpenapiClient = ReturnType<typeof DefaultApiFactory>;
type SanitizedOpenapiClient = {
  [Key in Exclude<
    keyof RawOpenapiClient,
    "executeEndpointOnGet" | "executeEndpointOnPost"
  >]: (
    ...args: Parameters<RawOpenapiClient[Key]>
  ) => Promise<
    ReturnType<RawOpenapiClient[Key]> extends AxiosPromise<infer T> ? T : never
  >;
};

/**
 * Extended client interface that adds executeRequest method
 * for unified endpoint execution
 */
export type EngineClient = SanitizedOpenapiClient & {
  executeRequest: ({
    path,
    requestMethod,
    parameters,
  }: {
    path: string;
    requestMethod: string;
    parameters: Record<string, string | number | boolean>;
  }) => Promise<JsonObject>;
};

function handleError(error: unknown): never {
  if (error instanceof AxiosError) {
    throw new Error(
      `Error calling ${error.config?.method} ${error.config?.url}: ${JSON.stringify(
        error.response?.data,
        null,
        2,
      )}`,
    );
  }
  throw error;
}

/**
 * Creates a configured engine client instance.
 * Requires ENGINE_BASE_PATH and ENGINE_API_KEY environment variables.
 *
 * @returns An initialized EngineClient instance
 * @throws Error if required environment variables are missing
 */
export function createEngineClient(): EngineClient {
  const basepath = process.env["ENGINE_BASE_PATH"];
  if (!basepath) {
    throw new Error("ENGINE_BASE_PATH is not set");
  }

  const apiKey = process.env["ENGINE_API_KEY"];
  if (!apiKey) {
    throw new Error("ENGINE_API_KEY is not set");
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": `Neurelo Connect CLI (${version})`,
  };

  // Create base OpenAPI client with configuration
  const base = DefaultApiFactory(
    new Configuration({
      basePath: basepath,
      baseOptions: {
        headers,
      },
    }),
  );

  // Return enhanced client with unified executeRequest method
  return {
    executeRequest: async (args) => {
      if (args.requestMethod === "GET") {
        const parameters: Record<string, string> = {};
        for (const [key, value] of Object.entries(args.parameters)) {
          parameters[key] = String(value);
        }
        return base
          .executeEndpointOnGet(args.path, parameters)
          .then((res) => res.data)
          .catch(handleError);
      }
      return base
        .executeEndpointOnPost(args.path, args.parameters)
        .then((res) => res.data)
        .catch(handleError);
    },
    // Map other API methods with error handling
    getEndpoints: () =>
      base
        .getEndpoints()
        .then((res) => res.data)
        .catch(handleError),
    getStatus: () =>
      base
        .getStatus()
        .then((res) => res.data)
        .catch(handleError),
    getTargetDbStatus: (args) =>
      base
        .getTargetDbStatus(args)
        .then((res) => res.data)
        .catch(handleError),
    executeReadonlyQuery: (args, body) =>
      base
        .executeReadonlyQuery(args, body)
        .then((res) => res.data)
        .catch(handleError),
    executeReadWriteQuery: (args, body) =>
      base
        .executeReadWriteQuery(args, body)
        .then((res) => res.data)
        .catch(handleError),
    getSchema: (args) =>
      base
        .getSchema(args)
        .then((res) => res.data)
        .catch(handleError),
    getTargets: () =>
      base
        .getTargets()
        .then((res) => res.data)
        .catch(handleError),
  };
}
