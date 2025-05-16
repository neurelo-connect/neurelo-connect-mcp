/**
 * MCP (Model Context Protocol) server implementation for Neurelo Connect.
 * This module provides functionality to create and manage an MCP server that exposes
 * database operations as tools that can be used by MCP clients.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { type JsonSchema, jsonSchemaToZod } from "json-schema-to-zod";
import { z } from "zod";
import { version } from "../package.json";
import {
  type EngineClient,
  createEngineClient,
  testEngineClient,
} from "./engine-client.js";
import type { MCPOptions } from "./main.js";
import type { EndpointMetadata } from "./openapi";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// The json-schema-to-zod library outputs code that contains some TypeScript
// annotations that are not valid JavaScript. We remove them here.
const tsAnnotationRegex = /<z\.ZodError\[\]>/;

export function getZodSchemaFromJsonSchema(
  jsonSchema: JsonSchema,
): z.ZodSchema {
  let zodSchemaString: string;
  try {
    zodSchemaString = jsonSchemaToZod(jsonSchema, {
      module: "none",
      noImport: true,
      type: false,
    });
  } catch (cause) {
    const error = new Error(
      `Failed to convert JSON schema to Zod schema: ${JSON.stringify(
        jsonSchema,
        null,
        2,
      )}`,
    );
    error.cause = cause;
    error.name = "ZodSchemaConversionError";
    // biome-ignore lint/suspicious/noExplicitAny: Setting a property on an error
    (error as any).sourceSchema = jsonSchema;
    throw error;
  }
  const functionString = `return ${zodSchemaString.replace(
    tsAnnotationRegex,
    "",
  )};`;
  // NOTE: The json-schema-to-zod library only supports JavaScript code as output.
  // Their documentation says to use `eval` to run the code, but that is generally
  // discouraged. We use `new Function` instead as it does not have access to the
  // current scope.
  return new Function("z", functionString)(z);
}

/**
 * Adds dynamic query tools to the MCP server based on endpoint metadata.
 * Each endpoint is converted into a tool with appropriate parameter validation.
 *
 * @param server - The MCP server instance
 * @param engine - The engine client for executing requests
 * @param endpoints - Array of endpoint metadata defining available operations
 * @param toolPrefix - Prefix to add to all tool names for namespacing
 */
function addEndpoints({
  server,
  engine,
  endpoints,
  toolPrefix,
  disableTools,
}: {
  server: McpServer;
  engine: EngineClient;
  endpoints: EndpointMetadata[];
  toolPrefix: string | undefined;
  disableTools?: string[];
}): void {
  for (const endpoint of endpoints) {
    // Convert endpoint parameters to Zod schemas for validation
    const parameterEntries = Object.entries(endpoint.params).map(
      ([name, param]) => {
        if (!param.schema) {
          throw new Error(
            `No schema found for parameter ${name} in endpoint ${endpoint.path}`,
          );
        }
        let schema = getZodSchemaFromJsonSchema(param.schema);
        if (param.optional) {
          schema = schema.optional();
        }
        schema = schema.describe(param.description);
        return [name, schema] as const;
      },
    );

    // Register the endpoint as a tool
    if (!disableTools?.includes(`query_${endpoint.path}`)) {
      server.tool(
        `${toolPrefix ? `${toolPrefix}_` : ""}query_${endpoint.path}`,
        `Defined Query${endpoint.description ? `: ${endpoint.description}` : ""}`,
        Object.fromEntries(parameterEntries),
        async (args: Record<string, string | number | boolean>) => {
          const result = await engine.executeRequest({
            path: endpoint.path,
            requestMethod: endpoint.requestMethod,
            parameters: args,
          });
          return {
            content: [
              {
                type: "text" as const,
                mimeType: "application/json",
                text: JSON.stringify(result),
              },
            ],
          };
        },
      );
    }
  }
}

/**
 * Starts an MCP server that exposes database operations as tools.
 * The server communicates via stdin/stdout using the MCP protocol.
 *
 * @param options - Server configuration options
 * @param options.name - Name of the MCP server
 * @param options.toolPrefix - Prefix for all tool names
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is a complex function
export async function startMcpServer({
  name,
  toolPrefix,
  dynamicEndpointTools,
  testMode,
  engineBasePath,
  engineApiKey,
  disableTools,
  port,
}: MCPOptions) {
  // Create an MCP server
  const server = new McpServer({
    name,
    version,
  });

  let engine: EngineClient;
  if (testMode) {
    engine = testEngineClient;
  } else {
    engine = createEngineClient({
      // biome-ignore lint/style/noNonNullAssertion: The CLI parser ensures these are set if the testMode flag is not set
      engineBasePath: engineBasePath!,
      // biome-ignore lint/style/noNonNullAssertion: The CLI parser ensures these are set if the testMode flag is not set
      engineApiKey: engineApiKey!,
    });
  }

  // Register built-in tools
  if (!disableTools?.includes("system_list_databases")) {
    server.tool(
      `${toolPrefix ? `${toolPrefix}_` : ""}system_list_databases`,
      "List all the available databases",
      async () => {
        const targets = await engine.getTargets();
        return {
          content: [
            {
              type: "text" as const,
              mimeType: "application/json",
              text: JSON.stringify(targets),
            },
          ],
        };
      },
    );
  }

  if (!disableTools?.includes("system_get_database_status")) {
    server.tool(
      `${toolPrefix ? `${toolPrefix}_` : ""}system_get_database_status`,
      "Get the status of a given database",
      {
        target: z.string(),
      },
      async (args) => {
        const status = await engine.getTargetDbStatus(args.target);
        return {
          content: [
            {
              type: "text" as const,
              mimeType: "application/json",
              text: JSON.stringify(status),
            },
          ],
        };
      },
    );
  }

  if (!disableTools?.includes("system_get_status")) {
    server.tool(
      `${toolPrefix ? `${toolPrefix}_` : ""}system_get_status`,
      "Check if all databases are running",
      {},
      async () => {
        const status = await engine.getStatus();
        return {
          content: [
            {
              type: "text" as const,
              mimeType: "application/json",
              text: JSON.stringify(status),
            },
          ],
        };
      },
    );
  }

  if (!disableTools?.includes("system_get_database_schema")) {
    server.tool(
      `${toolPrefix ? `${toolPrefix}_` : ""}system_get_database_schema`,
      "Get the schema for a given database",
      {
        target: z.string(),
      },
      async (args) => {
        const schema = await engine.getSchema(args.target);
        return {
          content: [
            {
              type: "text" as const,
              mimeType: "application/json",
              text: JSON.stringify(schema),
            },
          ],
        };
      },
    );
  }

  if (!disableTools?.includes("raw_readonly_query")) {
    server.tool(
      `${toolPrefix ? `${toolPrefix}_` : ""}raw_readonly_query`,
      "Execute a raw query against a database with readonly access. Can only be called if the database allows raw readonly queries.",
      {
        target: z.string().describe("The database to query"),
        query: z.string().describe("The query to execute"),
      },
      async (args) => {
        const result = await engine.executeReadonlyQuery(
          args.target,
          args.query,
        );
        return {
          content: [
            {
              type: "text" as const,
              mimeType: "application/json",
              text: JSON.stringify(result),
            },
          ],
        };
      },
    );
  }

  if (!disableTools?.includes("raw_query")) {
    server.tool(
      `${toolPrefix ? `${toolPrefix}_` : ""}raw_query`,
      "Execute a raw query against a database with read/write access. Can only be called if the database allows raw read/write queries.",
      {
        target: z.string().describe("The database to query"),
        query: z.string().describe("The query to execute"),
      },
      async (args) => {
        const result = await engine.executeReadWriteQuery(
          args.target,
          args.query,
        );
        return {
          content: [
            {
              type: "text" as const,
              mimeType: "application/json",
              text: JSON.stringify(result),
            },
          ],
        };
      },
    );
  }

  if (dynamicEndpointTools) {
    // Add static query tools based on endpoint metadata
    server.tool(
      `${toolPrefix ? `${toolPrefix}_` : ""}system_get_endpoints`,
      "Get all available endpoints for stored queries and workflows",
      {},
      async () => {
        const endpoints = await engine.getEndpoints();
        return {
          content: [
            {
              type: "text" as const,
              mimeType: "application/json",
              text: JSON.stringify(endpoints.data),
            },
          ],
        };
      },
    );

    server.tool(
      `${toolPrefix ? `${toolPrefix}_` : ""}call_endpoint`,
      "Call a given stored query/playbook endpoint with the provided parameters",
      {
        path: z.string(),
        requestMethod: z.string(),
        parameters: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean()]),
        ),
      },
      async (args) => {
        const result = await engine.executeRequest({
          path: args.path,
          requestMethod: args.requestMethod,
          parameters: args.parameters,
        });
        return {
          content: [
            {
              type: "text" as const,
              mimeType: "application/json",
              text: JSON.stringify(result),
            },
          ],
        };
      },
    );
  } else {
    // Add dynamic endpoint tools based on endpoint metadata
    const endpoints = await engine.getEndpoints();
    addEndpoints({
      server,
      engine,
      endpoints: endpoints.data,
      toolPrefix,
      disableTools,
    });
  }

  if (port) {
    const app = express();

    const transports: { [sessionId: string]: SSEServerTransport } = {};

    app.get("/sse", async (_, res) => {
      const transport = new SSEServerTransport("/messages", res);
      transports[transport.sessionId] = transport;

      res.on("close", () => {
        delete transports[transport.sessionId];
      });

      await server.connect(transport);
    });

    app.post("/messages", async (req, res) => {
      const sessionId = req.query["sessionId"];

      if (typeof sessionId !== "string") {
        res.status(400).send({ messages: "Invalid sessionId." });
        return;
      }

      const transport = transports[sessionId];

      if (!transport) {
        res.status(400).send({ messages: "Invalid sessionId." });
        return;
      }

      await transport.handlePostMessage(req, res);
    });

    app.listen(Number.parseInt(port));
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
