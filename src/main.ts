/**
 * CLI entry point for Neurelo Connect.
 * Provides command-line interface for starting MCP server and other operations.
 */

import { stderr } from "node:process";
import { Command } from "commander";
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
  .version(version)
  .hook("preAction", () => {
    if (!(process.env["ENGINE_BASE_PATH"] && process.env["ENGINE_API_KEY"])) {
      stderr.write("Error: ENGINE_BASE_PATH and ENGINE_API_KEY must be set\n");
      process.exit(1);
    }
    checkNodeVersion();
  })
  .requiredOption(
    "--name <name>",
    "The name of the MCP server. Defaults to NEURELO_MCP_NAME environment variable if set.",
    process.env["NEURELO_MCP_NAME"] ?? "Neurelo Connect",
  )
  .option(
    "--tool-prefix [prefix]",
    "Prefix of the tool names. Defaults to NEURELO_TOOL_PREFIX environment variable. If not set, tools will not be namespaced.",
    process.env["NEURELO_TOOL_PREFIX"],
  )
  .action(startMcpServer);

program.parse();
