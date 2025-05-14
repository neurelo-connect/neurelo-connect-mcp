/**
 * CLI entry point for Neurelo Connect.
 * Provides command-line interface for starting MCP server and other operations.
 */

import { stderr } from "node:process";
import { Command, Option } from "commander";
import { version } from "../package.json";
import { startMcpServer } from "./mcp.js";

/**
 * Checks if the current Node.js version meets the minimum requirement.
 * Exits with error if version is too low.
 */
function checkNodeVersion() {
  const currentVersion = process.versions.node;
  const requiredMajorVersion = 18;

  const major =
    typeof currentVersion === "string"
      ? Number.parseInt(currentVersion.split(".")?.[0] ?? "0", 10)
      : 0;

  if (major < requiredMajorVersion) {
    stderr.write(
      `Error: This CLI requires Node.js version ${requiredMajorVersion} or higher\n`,
    );
    stderr.write(`Current version: ${currentVersion}\n`);
    process.exit(1);
  }
}

// Set up CLI commands
const program = new Command();

program
  .name("neurelo-connect-mcp")
  .description("Neurelo Connect MCP server")
  .version(version);

/**
 * Options for the MCP server.
 */
// biome-ignore lint/style/useNamingConvention: MCP is an acronym
export type MCPOptions = {
  name: string;
  toolPrefix?: string;
  dynamicEndpointTools: boolean;
  testMode?: boolean;
  engineBasePath?: string;
  engineApiKey?: string;
  disableRawQueryTool?: boolean;
  disableRawReadonlyTool?: boolean;
};

program
  .command("start")
  .description("Start the MCP server")
  .addOption(
    new Option("--name <name>", "The name of the MCP server.")
      .env("NEURELO_MCP_NAME")
      .default("Neurelo Connect"),
  )
  .addOption(
    new Option(
      "--tool-prefix [prefix]",
      "Prefix of the tool names. If not set, tools will not be namespaced.",
    ).env("NEURELO_TOOL_PREFIX"),
  )
  .addOption(
    new Option(
      "--dynamic-endpoint-tools",
      "Handle endpoints dynamically instead of adding them individually as tools.",
    ).default(false),
  )
  .addOption(
    (() => {
      const option = new Option(
        "--test-mode",
        "Run the MCP server in test mode. This will not talk to a real engine, but will instead respond with mock data.",
      );
      option.hidden = true;
      return option;
    })(),
  )
  .addOption(
    new Option("--engine-base-path <path>", "The base path of the engine.").env(
      "ENGINE_BASE_PATH",
    ),
  )
  .addOption(
    new Option("--engine-api-key <key>", "The API key for the engine.").env(
      "ENGINE_API_KEY",
    ),
  )
  .addOption(
    new Option("--disable-raw-query-tool", "Disable raw query tool.").default(
      false,
    ),
  )
  .addOption(
    new Option(
      "--disable-raw-readonly-tool",
      "Disable raw readonly tool.",
    ).default(false),
  )
  .hook("preAction", (thisCommand) => {
    checkNodeVersion();

    // Only require engine options if not in test mode
    const options = thisCommand.optsWithGlobals();
    if (!options["testMode"]) {
      if (!(options["engineBasePath"] && options["engineApiKey"])) {
        stderr.write(
          "--engine-base-path and --engine-api-key are required when not in test mode\n",
        );
        process.exit(1);
      }
    }
  })
  .action((options) => {
    startMcpServer(options);
  });

program.parse();
