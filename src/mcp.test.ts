import type { JsonSchema } from "json-schema-to-zod";
import { assert, describe, expect, test } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getZodSchemaFromJsonSchema } from "./mcp.js";

describe("#getZodSchemaFromJsonSchema", () => {
  test.each([
    {
      description: "string",
      jsonSchema: { type: "string" },
      shouldparse: ["a", "b", "c"],
      shouldnotparse: [1, 2, 3],
    },
    {
      description: "number",
      jsonSchema: { type: "number" },
      shouldparse: [1, 2, 3],
      shouldnotparse: ["a", "b", "c"],
    },
    {
      description: "boolean",
      jsonSchema: { type: "boolean" },
      shouldparse: [true, false],
      shouldnotparse: ["a", "b", "c"],
    },
    {
      description: "array",
      jsonSchema: { type: "array", items: { type: "number" } },
      shouldparse: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      shouldnotparse: [1, "a", true, { a: 1 }, [1, "a"]],
    },
    {
      description: "object",
      jsonSchema: { type: "object" },
      expected: {
        type: "object",
        additionalProperties: {},
      },
      shouldparse: [{ a: 1 }, { b: 2 }, { c: 3 }],
      shouldnotparse: [1, "a", true, [1, "a"]],
    },
    {
      description: "enum",
      jsonSchema: { type: "string", enum: ["a", "b", "c"] },
      shouldparse: ["a", "b", "c"],
      shouldnotparse: ["d", "e", "f"],
    },
    {
      description: "oneOf",
      jsonSchema: { oneOf: [{ type: "string" }, { type: "number" }] },
      expected: {
        // NOTE: This is not correct but the zod-to-json-schema library does not support oneOf
      },
      shouldparse: ["a", 1],
      shouldnotparse: [false, {}, null, []],
    },
    {
      description: "complex",
      jsonSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
        additionalProperties: false,
      },
      shouldparse: [
        { name: "John", age: 30 },
        { name: "Jane", age: 25 },
      ],
      shouldnotparse: [1, "a", true, { a: 1 }, [1, "a"]],
    },
  ] satisfies {
    description: string;
    jsonSchema: JsonSchema;
    expected?: JsonSchema;
    shouldparse: unknown[];
    shouldnotparse: unknown[];
  }[])(
    "should convert a $description schema to a zod schema",
    ({ jsonSchema, expected, shouldparse, shouldnotparse }) => {
      const zodSchema = getZodSchemaFromJsonSchema(jsonSchema);

      expect(zodSchema).toBeDefined();

      for (const value of shouldparse) {
        assert(
          zodSchema.safeParse(value).success,
          `should parse ${JSON.stringify(value)}`,
        );
      }

      for (const value of shouldnotparse) {
        assert(
          !zodSchema.safeParse(value).success,
          `should not parse ${JSON.stringify(value)}`,
        );
      }

      expect(zodToJsonSchema(zodSchema)).toEqual({
        // biome-ignore lint/style/useNamingConvention: external property name
        $schema: "http://json-schema.org/draft-07/schema#",
        ...(expected ?? jsonSchema),
      });
    },
  );
});
