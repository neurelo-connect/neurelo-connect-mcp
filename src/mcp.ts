/**
 * MCP (Model Context Protocol) server implementation for Neurelo Connect.
 * This module provides functionality to create and manage an MCP server that exposes
 * database operations as tools that can be used by MCP clients.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { version } from "../package.json";
import {
  type EngineClient,
  createEngineClient,
  testEngineClient,
} from "./engineClient.js";
import type { EndpointMetadata } from "./openapi";
import type { MCPOptions } from "./main.js";

/**
 * Adds dynamic query tools to the MCP server based on endpoint metadata.
 * Each endpoint is converted into a tool with appropriate parameter validation.
 *
 * @param server - The MCP server instance
 * @param engine - The engine client for executing requests
 * @param endpoints - Array of endpoint metadata defining available operations
 * @param toolPrefix - Prefix to add to all tool names for namespacing
 */
function addQueries({
  server,
  engine,
  endpoints,
  toolPrefix,
}: {
  server: McpServer;
  engine: EngineClient;
  endpoints: EndpointMetadata[];
  toolPrefix: string | undefined;
}): void {
  for (const endpoint of endpoints) {
    // Convert endpoint parameters to Zod schemas for validation
    const parameterEntries = Object.entries(endpoint.params).map(
      ([name, param]) => {
        let schema: z.ZodSchema;
        switch (param.type) {
          case "String":
            schema = z.string();
            break;
          case "Int":
            schema = z.number().int();
            break;
          case "Float":
            schema = z.number();
            break;
          case "Boolean":
            schema = z.boolean();
            break;
          default:
            throw new Error(`Unknown parameter type: ${param.type}`);
        }
        // Handle array parameters
        if (param.list) {
          schema = z.array(schema);
        }
        // Handle optional parameters
        if (param.optional) {
          schema = z.union([schema, z.literal(null)]).optional();
        }
        if (param.description) {
          schema = schema.describe(param.description);
        }
        return [name, schema] as const;
      },
    );

    // Register the endpoint as a tool
    server.tool(
      `${toolPrefix ? `${toolPrefix}_` : ""}query_${endpoint.path}`,
      `Stored Query${endpoint.description ? `: ${endpoint.description}` : ""}`,
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

/**
 * Starts an MCP server that exposes database operations as tools.
 * The server communicates via stdin/stdout using the MCP protocol.
 *
 * @param options - Server configuration options
 * @param options.name - Name of the MCP server
 * @param options.toolPrefix - Prefix for all tool names
 */
export async function startMcpServer({
  name,
  toolPrefix,
  testMode,
  engineBasePath,
  engineApiKey,
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
  const endpoints = await engine.getEndpoints();

  // Register built-in tools
  server.tool(
    `${toolPrefix ? `${toolPrefix}_` : ""}system_list_targets`,
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

  server.tool(
    `${toolPrefix ? `${toolPrefix}_` : ""}system_get_schema`,
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

  server.tool(
    `${toolPrefix ? `${toolPrefix}_` : ""}raw_readonly_query`,
    "Execute a raw query against a database with readonly access",
    {
      target: z.string().describe("The database to query"),
      query: z.string().describe("The query to execute"),
    },
    async (args) => {
      const result = await engine.executeReadonlyQuery(args.target, args.query);
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

  server.tool(
    `${toolPrefix ? `${toolPrefix}_` : ""}raw_query`,
    "Execute a raw query against a database with read/write access",
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

  // Add dynamic query tools based on endpoint metadata
  addQueries({ server, engine, endpoints: endpoints.data, toolPrefix });

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
