#!/usr/bin/env node
//------------------------------------------------------------------------------------
// protocol-test.mjs -- Part of RStellarScribe
//
// Drives the real MCP server as a child process over the stdio transport, which is
// the only path an MCP client ever uses. The selftest exercises the handler
// in-process; this script proves the newline-delimited JSON-RPC framing, the
// handshake and a tool call that touches the filesystem.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//------------------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = join(projectRoot, '.protocol-test');
const modRoot = join(scratch, 'PipeMod');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` :: ${detail}` : ''}`);
    process.stdout.write(`  FAIL ${name}${detail ? ` :: ${detail}` : ''}\n`);
  }
}

function main() {
  rmSync(scratch, { recursive: true, force: true });

  const child = spawn(process.execPath, [join(projectRoot, 'src', 'index.mjs')], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = '';
  let stderr = '';
  const pending = new Map();
  let nextId = 1;

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line === '') continue;
      const message = JSON.parse(line);
      const resolver = pending.get(message.id);
      if (resolver) {
        pending.delete(message.id);
        resolver(message);
      }
    }
  });

  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, resolve);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timed out waiting for ${method}`));
      }, 20000);
      const original = pending.get(id);
      pending.set(id, (message) => {
        clearTimeout(timer);
        original(message);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });

  const notify = (method, params) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  };

  return (async () => {
    process.stdout.write('stdio MCP transport\n');

    const init = await request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'protocol-test', version: '1' },
    });
    check('initialize answers over the pipe', init.result?.serverInfo?.name === 'rstellariscribe');
    check('server reports its version', typeof init.result.serverInfo.version === 'string');
    check('capabilities include tools', 'tools' in init.result.capabilities);
    check(
      'instructions tell the agent to read knowledge first',
      typeof init.result.instructions === 'string' && init.result.instructions.includes('knowledge'),
    );

    notify('notifications/initialized');

    const toolList = await request('tools/list', {});
    check('tools/list arrives over the pipe', toolList.result.tools.length >= 25, `count=${toolList.result?.tools?.length}`);
    check(
      'every tool travels with its schema',
      toolList.result.tools.every((tool) => tool.inputSchema?.properties),
    );

    const resourceList = await request('resources/list', {});
    check('resources/list arrives over the pipe', resourceList.result.resources.length > 30);
    const topicUri = resourceList.result.resources.find(
      (resource) =>
        resource.uri.startsWith('rstellariscribe://stellaris/knowledge/') &&
        !resource.uri.endsWith('/catalog'),
    )?.uri;
    const resourceRead = await request('resources/read', { uri: topicUri });
    check('a knowledge topic can be read out of process', resourceRead.result.contents[0].text.startsWith('#'));

    const promptList = await request('prompts/list', {});
    check('prompts/list arrives over the pipe', promptList.result.prompts.length === 5);
    const promptGet = await request('prompts/get', {
      name: 'stellaris_mod_planner',
      arguments: { request: 'add a tradition tree' },
    });
    check('a prompt renders over the pipe', promptGet.result.messages[0].content.text.includes('tradition tree'));

    const ping = await request('ping', {});
    check('ping answers', ping.result !== undefined);

    const dryRun = await request('tools/call', {
      name: 'setup_stellaris_mod_skeleton',
      arguments: { mod_name: 'Pipe Mod', folder_name: 'pipemod', dry_run: true },
    });
    check('a dry run works over the pipe', dryRun.result.content[0].text.includes('"dry_run": true'));
    check('the dry run did not create files', !existsSync(modRoot));

    const write = await request('tools/call', {
      name: 'setup_stellaris_mod_skeleton',
      arguments: { mod_name: 'Pipe Mod', folder_name: 'pipemod', dry_run: false, output_root: modRoot },
    });
    check('a real write works over the pipe', write.result.content[0].text.includes('wrote'));
    check('the mod skeleton exists on disk', existsSync(join(modRoot, 'descriptor.mod')));

    const validate = await request('tools/call', {
      name: 'validate_stellaris_project',
      arguments: { workspace_root: modRoot },
    });
    const report = JSON.parse(validate.result.content[0].text);
    check('the written mod validates with no errors', report.error_count === 0, JSON.stringify(report.errors?.slice(0, 2)));

    const badArgs = await request('tools/call', {
      name: 'generate_localisation_batch',
      arguments: { file_stem: '../../escape', entries: [{ id: 'a', title: 'A' }], dry_run: false, output_root: modRoot },
    });
    check('an unsafe write returns invalid_params over the pipe', badArgs.error?.code === -32602, JSON.stringify(badArgs).slice(0, 160));

    const mediaTools = toolList.result.tools
      .filter((tool) => ['register_image_asset', 'validate_image_asset', 'register_audio_asset', 'validate_audio_asset'].includes(tool.name))
      .map((tool) => tool.name);
    check('the four media asset tools are announced with schemas', mediaTools.length === 4, JSON.stringify(mediaTools));

    const badAssetWrite = await request('tools/call', {
      name: 'register_image_asset',
      arguments: {
        prefix: 'pipeprobe',
        gfx_file: '../outside/pipe.gfx',
        output_root: modRoot,
        sprites: [{ sprite_name: 'GFX_pipeprobe_icon', texture_file: 'D:/does/not/exist.dds', texture_relpath: 'gfx/interface/pipe.dds' }],
      },
    });
    check(
      'a media write outside interface/ is refused over the pipe as invalid_params',
      badAssetWrite.error?.code === -32602 && String(badAssetWrite.error?.message).includes('must be under `interface/`'),
      JSON.stringify(badAssetWrite).slice(0, 200),
    );

    const badAudio = await request('tools/call', {
      name: 'validate_audio_asset',
      arguments: { kind: 'vinyl', prefix: 'pipeprobe', audio_file: join(projectRoot, 'package.json') },
    });
    check(
      'an impossible media argument is refused over the pipe as invalid_params',
      badAudio.error?.code === -32602 && String(badAudio.error?.message).includes('`kind` must be one of'),
      JSON.stringify(badAudio).slice(0, 200),
    );

    child.stdin.end();
    await new Promise((resolve) => child.on('exit', resolve));
    check('the server exits cleanly on stdin close', child.exitCode === 0, `exit=${child.exitCode} stderr=${stderr.slice(0, 200)}`);
    check('nothing was written to stderr', stderr.trim() === '', stderr.slice(0, 200));

    process.stdout.write(`\n${'='.repeat(72)}\npassed ${passed}, failed ${failed}\n`);
    if (failures.length > 0) {
      process.stdout.write('\nfailures:\n');
      for (const failure of failures) process.stdout.write(`  - ${failure}\n`);
    }
    process.exitCode = failed === 0 ? 0 : 1;
  })();
}

main().catch((thrown) => {
  process.stderr.write(`protocol-test crashed: ${thrown instanceof Error ? thrown.stack : thrown}\n`);
  process.exitCode = 1;
});
