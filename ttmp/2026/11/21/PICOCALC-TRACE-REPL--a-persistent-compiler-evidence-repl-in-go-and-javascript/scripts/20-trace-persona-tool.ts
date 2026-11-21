// Only the host supplies a session endpoint. Evaluated JS cannot select a URL.
import {createHash} from "node:crypto";
import {Type} from "@earendil-works/pi-ai";
import type {ExtensionAPI} from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerFlag("trace-session", {description: "Loopback session endpoint", type: "string"});
  let calls = 0;
  pi.registerTool({
    name: "trace_eval",
    label: "Evaluate JavaScript in your compiler evidence session",
    description: "Run JS in your persistent evidence REPL. The last value is returned. Start at q.help().",
    parameters: Type.Object({source: Type.String({description: "JavaScript source, including an expression returning the desired data"})}),
    async execute(_id, {source}) {
      if (++calls > 14) throw new Error("The 14-query session budget is complete. Submit the findings you have.");
      const endpoint = new URL(String(pi.getFlag("trace-session")));
      if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" ||
          !/^\/sessions\/[a-zA-Z0-9_-]+\/eval$/.test(endpoint.pathname) ||
          endpoint.search || endpoint.hash || endpoint.username || endpoint.password)
        throw new Error("The operator must configure a loopback trace session");
      const response = await fetch(endpoint, {method: "POST", redirect: "error",
        headers: {"Content-Type": "application/json"}, body: JSON.stringify({source}),
        signal: AbortSignal.timeout(15000)});
      const body = await response.text();
      // Mark excerpts explicitly. An omitted tail must never look like a complete table.
      const text = body.length <= 4000 ? body : body.slice(0, 4000) +
        "\n[OUTPUT ABBREVIATED: inspect a smaller projection or a single row]";
      return {content: [{type: "text", text}], details: {httpStatus: response.status, bytes: Buffer.byteLength(body),
        fullReplySHA256: createHash("sha256").update(body).digest("hex"), abbreviated: text !== body}};
    }
  });
  pi.on("before_agent_start", () => { pi.setActiveTools(["trace_eval"]); });
}
