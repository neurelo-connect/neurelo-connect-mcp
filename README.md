# Neurelo Connect MCP Server

[![npm version](https://img.shields.io/npm/v/@neurelo/connect-mcp)](https://www.npmjs.com/package/@neurelo/connect-mcp)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Build](https://github.com/neurelo-connect/mcp-server/actions/workflows/build.yml/badge.svg)](https://github.com/neurelo-connect/mcp-server/actions/workflows/build.yml)

Model Context Protocol (MCP) is a [new, standardized protocol](https://modelcontextprotocol.io/introduction) for managing context between large language models (LLMs) and external systems. In this repository, we provide an MCP Server for [Neurelo Connect](https://neurelo.com/connect).

This lets you use Claude Desktop, or any MCP Client, to use natural language to accomplish things with your databases, e.g.:

```
- TODO: Add examples
```

# Claude Setup

## Manual Setup

1. Open the Claude Desktop configuration file located at:

   - On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

2. Add the following:

```json
{
  "mcpServers": {
    "neurelo-connect": {
      "command": "npx",
      "args": ["@neurelo/connect-mcp", "start"],
      "env": {
        "ENGINE_API_KEY": "YOUR_ENGINE_API_KEY",
        "ENGINE_BASE_PATH": "YOUR_ENGINE_BASE_PATH"
      }
    }
  }
}
```

## Requirements

- Node.js >= v18.0.0
- Claude Desktop
- Neurelo Connect API key - you can generate one through the Neurelo Connect console.

# Features

## Supported Tools

- `list_targets` - List all the available targets
- `get_status` - Check if all database targets are running
- `get_schema` - Get the schema for a given database target
  - `target` (string): The name of the target database
- `readonly_query` - Execute read-only SQL queries on your database
  - Input:
    - `target` (string): The target database name
    - `query` (string): The SQL query to execute
  - All queries are validated to ensure they are read-only for security
- Dynamic endpoint tools - Additional tools are automatically generated based on your endpoint metadata

# Development

## Development with the MCP inspector

The easiest way to get started is to use the MCP inspector to run the server in development mode:

```bash
npm run inspect
```

## Development with Claude Desktop

Install dependencies:

```
npm install
```

Add the following to your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "neurelo-connect": {
      "command": "npx",
      "args": ["tsx", "REPOSITORY_ROOT/src/main.ts"],
      "cwd": "REPOSITORY_ROOT",
      "env": {
        "ENGINE_API_KEY": "YOUR_ENGINE_API_KEY",
        "ENGINE_BASE_PATH": "YOUR_ENGINE_BASE_PATH"
      }
    }
  }
}
```

Then, **restart Claude** each time you want to test changes.

# Contributing

We welcome contributions! Please feel free to submit a Pull Request.
