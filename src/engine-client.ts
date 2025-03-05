/**
 * Engine client module for interacting with the Neurelo Connect backend.
 * Provides a typed client for making API requests to execute workflows and queries.
 */

import { AxiosError, type AxiosPromise, type AxiosResponse } from "axios";
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

class EngineCallError extends Error {
  public readonly status: number | undefined;
  public readonly headers:
    | AxiosResponse<unknown, unknown>["headers"]
    | undefined;
  public readonly error: JsonObject | undefined;

  constructor(
    method: string | undefined,
    url: string | undefined,
    status: number | undefined,
    headers: AxiosResponse<unknown, unknown>["headers"] | undefined,
    error: JsonObject | undefined,
  ) {
    super(`Error calling ${method} ${url}`);
    this.name = "EngineCallError";
    this.status = status;
    this.headers = headers;
    this.error = error;
  }
}

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
    throw new EngineCallError(
      error.config?.method ?? "unknown",
      error.config?.url ?? "unknown",
      error.response?.status,
      error.response?.headers,
      error.response?.data ?? {},
    );
  }
  throw error;
}

export const testEngineClient: EngineClient = {
  getEndpoints: async () => ({
    data: [
      {
        description: "Test endpoint",
        path: "test",
        requestMethod: "GET",
        params: {},
      },
    ],
  }),
  getTargets: async () => ({
    data: [
      {
        slug: "test-clickhouse",
        description: "Test ClickHouse database",
        engineType: "clickhouse",
      },
      {
        slug: "test-postgres",
        description: "Test Postgres database",
        engineType: "postgres",
      },
      {
        slug: "test-db-down",
        description: "Test database that is down",
        engineType: "postgres",
      },
    ],
  }),
  getStatus: async () => ({
    ok: true,
  }),
  getTargetDbStatus: async (targetSlug) => ({
    ok: targetSlug !== "test-db-down",
  }),
  executeReadonlyQuery: async (target, query) => ({
    target,
    query,
  }),
  executeReadWriteQuery: async (target, query) => ({
    target,
    query,
  }),
  getSchema: async (target) => ({
    target,
    schema: {
      columns: [{ name: "i", type: "UInt64" }],
    },
  }),
  executeRequest: async (args) => ({
    args,
  }),
};
/**
 * @returns An initialized EngineClient instance
 * @throws Error if required environment variables are missing
 */
export function createEngineClient({
  engineBasePath,
  engineApiKey,
}: {
  engineBasePath: string;
  engineApiKey: string;
}): EngineClient {
  const basepath = engineBasePath;
  const apiKey = engineApiKey;

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
