//------------------------------------------------------------------------------------
// mcp.mjs -- Part of RStellarScribe
//
// A dependency-free Model Context Protocol server over stdio. RHoiScribe uses the
// `rmcp` crate; this port speaks the same protocol directly, so the server keeps
// the original's observable behaviour without a build step.
//
// Transport: newline-delimited JSON-RPC 2.0 on stdin/stdout, exactly as the MCP
// stdio transport defines. Diagnostics go to stderr, never to stdout.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

export const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

/**
 * Create a request handler over a registry of prompts, resources and tools.
 *
 * @param {{serverInfo: {name: string, version: string}, instructions?: string,
 *          prompts: object, resources: object, tools: object}} registry
 */
export function createHandler(registry) {
  return async function handle(message) {
    const { id, method, params } = message;
    const isNotification = id === undefined || id === null;

    try {
      switch (method) {
        case 'initialize':
          return respond(id, {
            protocolVersion: negotiateProtocol(params?.protocolVersion),
            capabilities: {
              prompts: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
              tools: { listChanged: false },
            },
            serverInfo: registry.serverInfo,
            instructions: registry.instructions,
          });

        case 'notifications/initialized':
        case 'notifications/cancelled':
        case 'notifications/roots/list_changed':
          return null;

        case 'ping':
          return respond(id, {});

        case 'prompts/list':
          return respond(id, { prompts: registry.prompts.list() });

        case 'prompts/get': {
          const prompt = registry.prompts.get(params?.name, params?.arguments ?? {});
          return respond(id, prompt);
        }

        case 'resources/list':
          return respond(id, { resources: registry.resources.list() });

        case 'resources/templates/list':
          return respond(id, { resourceTemplates: registry.resources.templates?.() ?? [] });

        case 'resources/read': {
          const resource = registry.resources.read(params?.uri);
          return respond(id, { contents: [resource] });
        }

        case 'tools/list':
          return respond(id, { tools: registry.tools.list() });

        case 'tools/call': {
          const result = await registry.tools.call(params?.name, params?.arguments ?? {});
          return respond(id, toolResult(result));
        }

        default:
          if (isNotification) return null;
          return error(id, -32601, `method not found: ${method}`);
      }
    } catch (thrown) {
      const text = thrown instanceof Error ? thrown.message : String(thrown);
      // RHoiScribe maps its ToolError onto MCP `invalid_params` rather than a tool
      // result, so a bad argument is a protocol error on both sides. Anything else
      // is reported as a failed tool result, which keeps the message in front of the
      // agent instead of turning it into a transport failure.
      if (thrown && thrown.name === 'ToolError') {
        return error(id, -32602, text);
      }
      if (method === 'tools/call') {
        return respond(id, {
          content: [{ type: 'text', text }],
          isError: true,
        });
      }
      return error(id, -32603, text);
    }
  };
}

/** Wrap a tool return value as an MCP tool result. */
export function toolResult(value) {
  if (value && typeof value === 'object' && value.__mcpContent) {
    return { content: value.__mcpContent };
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

/** Serve the handler over stdio until stdin closes. */
export function runStdio(handler, { input = process.stdin, output = process.stdout } = {}) {
  return new Promise((resolve) => {
    let buffer = '';
    input.setEncoding('utf8');

    input.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line === '') continue;
        dispatch(line);
      }
    });

    input.on('end', () => {
      if (buffer.trim() !== '') dispatch(buffer.trim());
      resolve();
    });

    async function dispatch(line) {
      let message;
      try {
        message = JSON.parse(line);
      } catch (thrown) {
        write(error(null, -32700, `invalid JSON: ${thrown.message}`));
        return;
      }
      const response = await handler(message);
      if (response !== null && response !== undefined) write(response);
    }

    function write(value) {
      output.write(JSON.stringify(value) + '\n');
    }
  });
}

function respond(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function error(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function negotiateProtocol(requested) {
  if (typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return requested;
  }
  return DEFAULT_PROTOCOL_VERSION;
}
