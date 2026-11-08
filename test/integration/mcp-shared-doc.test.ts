import { createServer, defineTool } from "@trysac/mcp-server-template";
import { constantBackoff, retry } from "@trysac/retry-policies";
import { describe, expect, it } from "vitest";
import { Doc } from "../../src/index.js";

describe("Integration: MCP Shared Doc with Retry Policies", () => {
  it("synchronizes a shared Doc between two agent clients via MCP tools and retries", async () => {
    const sharedDoc = new Doc("server");
    const serverMap = sharedDoc.getMap("mcp_state");
    serverMap.set("status", "initialized");

    const getDocUpdateTool = defineTool({
      name: "getDocUpdate",
      description: "Returns binary update of server document",
      inputSchema: {},
      handler: async () => {
        const update = sharedDoc.encodeUpdate();
        return {
          content: [{ type: "text", text: Buffer.from(update).toString("base64") }],
        };
      },
    });

    const applyDocUpdateTool = defineTool({
      name: "applyDocUpdate",
      description: "Applies binary update from agent",
      inputSchema: {},
      handler: async (args: Record<string, unknown>) => {
        const b64 = String(args.update ?? "");
        const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
        sharedDoc.applyUpdate(bytes);
        return {
          content: [{ type: "text", text: "OK" }],
        };
      },
    });

    const server = createServer({
      name: "crdt-mcp-server",
      version: "1.0.0",
      tools: [getDocUpdateTool, applyDocUpdateTool],
    });
    expect(server).toBeDefined();

    // Agent A and Agent B simulate clients using retry policy
    const agentA = new Doc("agent_a");
    const agentB = new Doc("agent_b");

    // Agent A performs updates
    agentA.getMap("mcp_state").set("agent_a_status", "active");
    agentA.getText("log").insert(0, "Agent A started.");

    // Sync Agent A -> Server with retry policy
    await retry(
      async () => {
        const updateA = agentA.encodeUpdate();
        sharedDoc.applyUpdate(updateA);
      },
      {
        maxAttempts: 3,
        backoff: constantBackoff(10),
      },
    );

    // Agent B updates concurrently
    agentB.getMap("mcp_state").set("agent_b_status", "ready");
    agentB.getText("log").insert(0, "Agent B ready.");

    const updateB = agentB.encodeUpdate();
    sharedDoc.applyUpdate(updateB);

    // Both agents sync from server
    const serverUpdate = sharedDoc.encodeUpdate();
    agentA.applyUpdate(serverUpdate);
    agentB.applyUpdate(serverUpdate);

    expect(agentA.toJSON()).toEqual(sharedDoc.toJSON());
    expect(agentB.toJSON()).toEqual(sharedDoc.toJSON());
    expect(agentA.toJSON().mcp_state).toEqual({
      status: "initialized",
      agent_a_status: "active",
      agent_b_status: "ready",
    });
  });
});
