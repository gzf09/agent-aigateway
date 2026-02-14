import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, AgentResponseChunk } from '@aigateway/shared';

export function setupWebSocket(wss: WebSocketServer, agentUrl: string) {
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');

    ws.on('message', async (raw: Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());
        await handleClientMessage(ws, msg, agentUrl);
      } catch (err) {
        sendToClient(ws, {
          type: 'error',
          sessionId: '',
          payload: { code: 'PARSE_ERROR', message: 'Invalid message format' },
        });
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });
}

async function handleClientMessage(ws: WebSocket, msg: ClientMessage, agentUrl: string) {
  const { type, sessionId, payload } = msg;

  switch (type) {
    case 'user_message':
      await streamAgentResponse(ws, sessionId, `${agentUrl}/agent/message`, {
        sessionId,
        message: payload.content || '',
      });
      break;

    case 'confirm':
      await streamAgentResponse(ws, sessionId, `${agentUrl}/agent/confirm`, {
        sessionId,
        action: 'accept',
        confirmedName: payload.confirmedName,
      });
      break;

    case 'cancel':
      await streamAgentResponse(ws, sessionId, `${agentUrl}/agent/confirm`, {
        sessionId,
        action: 'cancel',
      });
      break;

    case 'name_confirm':
      await streamAgentResponse(ws, sessionId, `${agentUrl}/agent/confirm`, {
        sessionId,
        action: 'accept',
        confirmedName: payload.confirmedName,
      });
      break;

    case 'rollback':
      await streamAgentResponse(ws, sessionId, `${agentUrl}/agent/rollback`, {
        sessionId,
      });
      break;

    case 'rollback_to_version':
      await streamAgentResponse(ws, sessionId, `${agentUrl}/agent/rollback-to-version`, {
        sessionId,
        targetVersionId: payload.targetVersionId,
      });
      break;

    case 'form_submit':
      await streamAgentResponse(ws, sessionId, `${agentUrl}/agent/message`, {
        sessionId,
        message: JSON.stringify(payload.formData),
      });
      break;

    default:
      sendToClient(ws, {
        type: 'error',
        sessionId,
        payload: { code: 'UNKNOWN_TYPE', message: `Unknown message type: ${type}` },
      });
  }
}

async function streamAgentResponse(ws: WebSocket, sessionId: string, url: string, body: unknown) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      sendToClient(ws, {
        type: 'error',
        sessionId,
        payload: { code: 'AGENT_ERROR', message: `Agent returned ${response.status}` },
      });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (!dataStr) continue;

        try {
          const chunk: AgentResponseChunk & { type: string } = JSON.parse(dataStr);
          const serverMsg = mapChunkToServerMessage(sessionId, chunk);
          if (serverMsg) {
            sendToClient(ws, serverMsg);
          }
        } catch {
          // skip malformed data
        }
      }
    }
  } catch (err: unknown) {
    sendToClient(ws, {
      type: 'error',
      sessionId,
      payload: { code: 'STREAM_ERROR', message: (err as Error).message },
    });
  }
}

function mapChunkToServerMessage(sessionId: string, chunk: Record<string, unknown>): ServerMessage | null {
  switch (chunk.type) {
    case 'text':
      return { type: 'agent_text', sessionId, payload: { content: chunk.content } };
    case 'confirm_card':
      return { type: 'confirm_card', sessionId, payload: chunk.card };
    case 'predictive_form':
      return { type: 'predictive_form', sessionId, payload: chunk.form };
    case 'clarification':
      return { type: 'clarification', sessionId, payload: chunk.question };
    case 'tool_start':
      return { type: 'tool_status', sessionId, payload: { toolName: chunk.toolName, status: 'calling' } };
    case 'tool_result':
      return { type: 'operation_result', sessionId, payload: chunk.result };
    case 'rollback_hint':
      return { type: 'rollback_hint', sessionId, payload: { snapshotId: chunk.snapshotId, versionId: chunk.versionId } };
    case 'dashboard_event':
      return { type: 'dashboard_update', sessionId, payload: chunk.event };
    case 'error':
      return { type: 'error', sessionId, payload: chunk.error };
    case 'done':
      return { type: 'agent_text_done', sessionId, payload: {} };
    default:
      return null;
  }
}

function sendToClient(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
