/**
 * Robotics Troubleshooting Advisor - Main Worker Entry Point
 * 
 * This file contains the Cloudflare Worker that handles:
 * - Serving the chat UI
 * - Processing chat messages with AI
 * - Managing session state via Durable Objects
 * 
 * @module index
 */

/**
 * Environment bindings available to the Worker
 */
interface Env {
  /** Workers AI binding for LLM inference */
  AI: Ai;
  /** Durable Object namespace for session persistence */
  ADVISOR_STATE: DurableObjectNamespace;
}

/**
 * Workers AI interface for running LLM models
 */
interface Ai {
  run(model: string, options: AiOptions): Promise<AiResponse>;
}

/**
 * Configuration options for AI model execution
 */
interface AiOptions {
  /** Array of messages forming the conversation context */
  messages: AiMessage[];
  /** Temperature (0-1) controlling response randomness */
  temperature: number;
  /** Maximum tokens to generate in response */
  max_tokens: number;
}

/**
 * Individual message in the conversation
 */
interface AiMessage {
  /** Role of the message sender */
  role: 'system' | 'user' | 'assistant';
  /** Content of the message */
  content: string;
}

/**
 * Response from the AI model
 */
interface AiResponse {
  /** Generated response text */
  response?: string;
  [key: string]: any;
}

/**
 * Durable Object namespace for creating and accessing instances
 */
interface DurableObjectNamespace {
  get(id: DurableObjectId): DurableObjectStub;
  idFromName(name: string): DurableObjectId;
}

/**
 * Stub for communicating with a Durable Object instance
 */
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

/**
 * Unique identifier for a Durable Object instance
 */
interface DurableObjectId {}

/**
 * State interface for Durable Object storage
 */
interface DurableObjectState {
  storage: {
    get(key: string): Promise<any>;
    put(key: string, value: any): Promise<void>;
  };
}

/**
 * Message format stored in conversation history
 */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Session state structure stored in Durable Object
 */
interface SessionState {
  stage: string;
  history: ChatMessage[];
}

import { DiagnosisWorkflow } from './workflow';

// ============================================================================
// DURABLE OBJECT
// ============================================================================

/**
 * AdvisorState - Durable Object for Session Persistence
 * 
 * Manages conversation history and diagnosis stage for each user session.
 * Each session gets its own instance, identified by session ID.
 */
export class AdvisorState {
  state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  /**
   * Handles incoming requests to the Durable Object
   * Routes to appropriate handler based on pathname
   * 
   * @param request - HTTP request from the Worker
   * @returns Response with requested data or error
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/message' && request.method === 'POST') {
      return await this.handleMessage(request);
    }

    if (url.pathname === '/state' && request.method === 'GET') {
      return await this.getState();
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Stores a new message pair (user + assistant) in conversation history
   * Updates the current diagnosis stage
   * 
   * @param request - Request containing userMessage, assistantMessage, and nextStage
   * @returns Success response with updated message count and stage
   */
  async handleMessage(request: Request): Promise<Response> {
    try {
      const { userMessage, assistantMessage, nextStage } = await request.json() as any;

      const historyStr = await this.state.storage.get('history') || '[]';
      const history = JSON.parse(historyStr);

      history.push({ role: 'user', content: userMessage, timestamp: Date.now() });
      history.push({ role: 'assistant', content: assistantMessage, timestamp: Date.now() });

      await this.state.storage.put('history', JSON.stringify(history));
      await this.state.storage.put('stage', nextStage);

      return new Response(
        JSON.stringify({ success: true, messageCount: history.length, stage: nextStage }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  /**
   * Retrieves current session state (stage and conversation history)
   * 
   * @returns Session state including stage, message count, and full history
   */
  async getState(): Promise<Response> {
    try {
      const historyStr = await this.state.storage.get('history') || '[]';
      const stage = await this.state.storage.get('stage') || 'initial';
      const history = JSON.parse(historyStr);

      return new Response(
        JSON.stringify({ stage, messageCount: history.length, history }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
}

// ============================================================================
// WORKER
// ============================================================================

/**
 * Main Worker Export
 * Handles HTTP requests and routes to appropriate handlers
 */
export default {
  /**
   * Main request handler for the Worker
   * Routes requests based on path:
   * - GET / → Serves chat UI
   * - POST /api/chat → Processes chat messages
   * - GET /api/history/:id → Retrieves session history
   * 
   * @param request - Incoming HTTP request
   * @param env - Environment bindings (AI, Durable Objects)
   * @returns Response (HTML or JSON)
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/' && request.method === 'GET') {
      return this.serveUI();
    }

    if (path === '/api/chat' && request.method === 'POST') {
      return await this.handleChat(request, env);
    }

    if (path.startsWith('/api/history/') && request.method === 'GET') {
      return await this.getHistory(request, env);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { 
      status: 404,
      headers: { 'Content-Type': 'application/json' } 
    });
  },

  serveUI(): Response {
    return new Response(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Robotics Troubleshooting Advisor</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            width: 100%;
            max-width: 700px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            display: flex;
            flex-direction: column;
            height: 85vh;
          }
          .header {
            padding: 20px;
            border-bottom: 1px solid #eee;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .header h1 {
            font-size: 24px;
            margin-bottom: 5px;
          }
          .header p {
            font-size: 14px;
            opacity: 0.9;
          }
          #chat {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background: #f9f9f9;
          }
          .message {
            margin-bottom: 15px;
            animation: fadeIn 0.3s ease-in;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .message.user {
            text-align: right;
          }
          .message.assistant {
            text-align: left;
          }
          .message-content {
            display: inline-block;
            max-width: 85%;
            padding: 12px 16px;
            border-radius: 8px;
            word-wrap: break-word;
            line-height: 1.5;
          }
          .message.user .message-content {
            background: #667eea;
            color: white;
            border-bottom-right-radius: 2px;
          }
          .message.assistant .message-content {
            background: #e9ecef;
            color: #333;
            border-bottom-left-radius: 2px;
          }
          .footer {
            padding: 20px;
            border-top: 1px solid #eee;
            background: white;
            display: flex;
            gap: 10px;
          }
          #userInput {
            flex: 1;
            padding: 12px 16px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 14px;
            outline: none;
          }
          #userInput:focus {
            border-color: #667eea;
          }
          #sendBtn {
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          }
          #sendBtn:hover {
            transform: translateY(-2px);
          }
          .stage-indicator {
            font-size: 12px;
            color: #999;
            padding: 0 20px 10px 20px;
          }
          .typing {
            display: inline-block;
            width: 20px;
            height: 12px;
          }
          .typing span {
            display: inline-block;
            width: 4px;
            height: 12px;
            background: #667eea;
            border-radius: 2px;
            margin: 0 2px;
            animation: typing 1.4s infinite;
          }
          .typing span:nth-child(2) { animation-delay: 0.2s; }
          .typing span:nth-child(3) { animation-delay: 0.4s; }
          @keyframes typing {
            0%, 60%, 100% { opacity: 0.3; }
            30% { opacity: 1; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🤖 Robotics Troubleshooting Advisor</h1>
            <p>Describe your robot problem and I'll help diagnose it</p>
          </div>
          <div class="stage-indicator">
            <span id="stageLabel">Stage: Initial Diagnosis</span>
          </div>
          <div id="chat"></div>
          <div class="footer">
            <input type="text" id="userInput" placeholder="E.g., My line follower oscillates...">
            <button id="sendBtn">Send</button>
          </div>
        </div>

        <script>
          let sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          let isWaiting = false;

          const chatEl = document.getElementById('chat');
          const inputEl = document.getElementById('userInput');
          const sendBtn = document.getElementById('sendBtn');
          const stageLabel = document.getElementById('stageLabel');

          const stageNames = { initial: 'Initial Diagnosis', diagnostic: 'Diagnostic Phase', solution: 'Solution Generation' };

          function addMessage(text, role) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message ' + role;
            const content = document.createElement('div');
            content.className = 'message-content';
            content.textContent = text;
            msgDiv.appendChild(content);
            chatEl.appendChild(msgDiv);
            chatEl.scrollTop = chatEl.scrollHeight;
          }

          function showTyping() {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message assistant';
            msgDiv.id = 'typing-indicator';
            const content = document.createElement('div');
            content.className = 'message-content';
            content.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
            msgDiv.appendChild(content);
            chatEl.appendChild(msgDiv);
            chatEl.scrollTop = chatEl.scrollHeight;
          }

          function removeTyping() {
            const typing = document.getElementById('typing-indicator');
            if (typing) typing.remove();
          }

          async function sendMessage() {
            const message = inputEl.value.trim();
            if (!message || isWaiting) return;

            addMessage(message, 'user');
            inputEl.value = '';
            inputEl.disabled = true;
            sendBtn.disabled = true;
            isWaiting = true;

            showTyping();

            try {
              const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, userMessage: message })
              });

              const data = await response.json();
              removeTyping();

              if (data.error) {
                addMessage('Error: ' + data.error, 'assistant');
              } else {
                addMessage(data.message, 'assistant');
                stageLabel.textContent = 'Stage: ' + (stageNames[data.stage] || 'Processing');
              }
            } catch (error) {
              removeTyping();
              addMessage('Network error: ' + error.message, 'assistant');
            } finally {
              inputEl.disabled = false;
              sendBtn.disabled = false;
              isWaiting = false;
              inputEl.focus();
            }
          }

          sendBtn.onclick = sendMessage;
          inputEl.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

          addMessage("Hi! I'm your robotics troubleshooting expert. Please describe the problem you're experiencing with your robot.", 'assistant');
          inputEl.focus();
        </script>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  },

  /**
   * Handles chat message processing
   * 
   * Flow:
   * 1. Validate input (sessionId, userMessage)
   * 2. Retrieve session state from Durable Object
   * 3. Run diagnosis workflow to determine stage and system prompt
   * 4. Build messages array with conversation history
   * 5. Call Llama AI model for response
   * 6. Save conversation to Durable Object
   * 7. Return AI response with updated stage
   * 
   * @param request - Request with sessionId and userMessage
   * @param env - Environment bindings
   * @returns JSON response with AI message and stage
   */
  async handleChat(request: Request, env: Env): Promise<Response> {
    try {
      const { sessionId, userMessage } = await request.json() as any;

      if (!sessionId || !userMessage) {
        return new Response(JSON.stringify({ error: 'sessionId and userMessage required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Retrieve session state from Durable Object
      const doId = env.ADVISOR_STATE.idFromName(sessionId);
      const doStub = env.ADVISOR_STATE.get(doId);

      const stateReq = new Request('http://do/state', { method: 'GET' });
      const stateRes = await doStub.fetch(stateReq);
      const sessionState = await stateRes.json() as any;

      const currentStage = sessionState.stage || 'initial';
      const conversationHistory = sessionState.history || [];

      // Run diagnosis workflow to determine next stage and get system prompt
      const diagnosisWorkflow = new DiagnosisWorkflow();
      const workflowResult = await diagnosisWorkflow.run({
        sessionId,
        userMessage,
        conversationHistory,
        currentStage
      });

      const { systemPrompt, nextStage } = workflowResult;

      // Build messages array for AI model
      // - System prompt for current stage
      // - Last 8 messages from history (for context window)
      // - Current user message
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-8).filter((m: any) => m && m.role && m.content).map((m: any) => ({
          role: String(m.role),
          content: String(m.content)
        })),
        { role: 'user', content: userMessage }
      ];

      // Call Llama 3.3 model via Workers AI
      const aiResponse = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages,
        temperature: 0.5,  // Balanced between deterministic and creative
        max_tokens: 400    // Limit response length
      });

      const assistantMessage = String(aiResponse.response || aiResponse);

      // Persist conversation to Durable Object
      const saveReq = new Request('http://do/message', {
        method: 'POST',
        body: JSON.stringify({ userMessage, assistantMessage, nextStage })
      });
      await doStub.fetch(saveReq);

      return new Response(
        JSON.stringify({ message: assistantMessage, stage: nextStage, sessionId }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      console.error('Chat error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },

  async getHistory(request: Request, env: Env): Promise<Response> {
    try {
      const sessionId = new URL(request.url).pathname.split('/api/history/')[1];

      const doId = env.ADVISOR_STATE.idFromName(sessionId);
      const doStub = env.ADVISOR_STATE.get(doId);

      const stateReq = new Request('http://do/state', { method: 'GET' });
      const stateRes = await doStub.fetch(stateReq);

      return new Response(JSON.stringify(await stateRes.json()), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
}
