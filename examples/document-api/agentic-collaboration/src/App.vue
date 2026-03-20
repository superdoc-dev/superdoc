<script setup>
import 'superdoc/style.css';
import { onMounted, onBeforeUnmount, shallowRef, ref, nextTick } from 'vue';
import { SuperDoc } from 'superdoc';

import sampleDocument from '/sample-document.docx?url';

// Backend URL: use VITE_BACKEND_URL env var, or fall back to localhost for dev
const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3050';
const wsUrl = backendUrl.replace(/^http/, 'ws');
const COLLAB_URL = `${wsUrl}/collaboration`;
const CHAT_URL = `${wsUrl}/chat`;
const DOCUMENT_ID = 'superdoc-demo';

const superdoc = shallowRef(null);
const chatWs = shallowRef(null);

// Chat state
const chatMessages = ref([]);
const chatInput = ref('');
const agentStatus = ref('offline');
const chatContainer = ref(null);

const USER_COLORS = ['#a11134', '#2a7e34', '#b29d11', '#2f4597', '#ab5b22'];

const initSuperDoc = () => {
  console.log('[Client] Initializing SuperDoc');
  console.log('[Client] Collaboration URL:', COLLAB_URL);
  console.log('[Client] Chat URL:', `${CHAT_URL}/${DOCUMENT_ID}`);
  console.log('[Client] Document ID:', DOCUMENT_ID);

  superdoc.value = new SuperDoc({
    selector: '#superdoc',
    toolbar: '#superdoc-toolbar',
    document: {
      id: DOCUMENT_ID,
      type: 'docx',
      url: sampleDocument,
      isNewFile: true,
    },
    pagination: false,
    colors: USER_COLORS,
    user: generateUserInfo(),
    modules: {
      collaboration: {
        url: `${COLLAB_URL}`,
        token: 'token',
      },
    },
  });
};

const initChat = () => {
  // Connect to simple WebSocket chat
  const chatUrl = `${CHAT_URL}/${DOCUMENT_ID}`;
  console.log('[Client] Connecting to chat:', chatUrl);
  const ws = new WebSocket(chatUrl);
  chatWs.value = ws;

  ws.onopen = () => {
    console.log('[Client] Chat connected');
  };

  ws.onerror = (error) => {
    console.error('[Client] Chat WebSocket error:', error);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'init') {
        chatMessages.value = data.messages || [];
        agentStatus.value = data.agentStatus || 'offline';
        scrollToBottom();
      } else if (data.type === 'message') {
        chatMessages.value.push(data.message);
        scrollToBottom();
      } else if (data.type === 'status') {
        agentStatus.value = data.status;
      } else if (data.type === 'clear') {
        chatMessages.value = [];
      }
    } catch (e) {
      console.error('[Client] Failed to parse message:', e);
    }
  };

  ws.onclose = (event) => {
    console.log('[Client] Chat disconnected, code:', event.code, 'reason:', event.reason);
    agentStatus.value = 'offline';
  };
};

const sendMessage = () => {
  const content = chatInput.value.trim();
  if (!content || !chatWs.value) return;

  // Check if WebSocket is open
  if (chatWs.value.readyState !== WebSocket.OPEN) {
    console.warn('[Client] WebSocket not open, reconnecting...');
    initChat();
    return;
  }

  const message = {
    id: `user-${Date.now()}`,
    role: 'user',
    content,
    timestamp: Date.now(),
  };

  chatWs.value.send(JSON.stringify({ type: 'message', ...message }));
  chatInput.value = '';
  scrollToBottom();
};

const handleKeydown = (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
};

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  });
};

const clearChat = () => {
  if (!chatWs.value) return;
  chatWs.value.send(JSON.stringify({ type: 'clear' }));
};

const generateUserInfo = () => {
  const randomUser = Math.random().toString(36).substring(2, 8);
  return {
    name: `User-${randomUser}`,
    email: `${randomUser}@superdoc.dev`,
    color: getRandomUserColor(),
  };
};

const getRandomUserColor = () => {
  const index = Math.floor(Math.random() * USER_COLORS.length);
  return USER_COLORS[index];
};

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

onMounted(() => {
  initSuperDoc();
  initChat();
});

onBeforeUnmount(() => {
  superdoc.value?.destroy();
  superdoc.value = null;
  chatWs.value?.close();
});
</script>

<template>
  <div class="app-container">
    <!-- Main Editor Area -->
    <div class="editor-area">
      <h1>SuperDoc - Document Editing Agent Demo</h1>
      <div id="superdoc-toolbar" class="my-custom-toolbar"></div>
      <div class="editor-container">
        <div id="superdoc" class="main-editor"></div>
      </div>
    </div>

    <!-- Chat Sidebar -->
    <div class="chat-sidebar">
      <div class="chat-header">
        <h2>Document Agent</h2>
        <div class="agent-status" :class="agentStatus">
          <span class="status-dot"></span>
          {{ agentStatus === 'thinking' ? 'Thinking...' : agentStatus === 'ready' ? 'Ready' : 'Offline' }}
        </div>
      </div>

      <div class="chat-messages" ref="chatContainer">
        <div v-if="chatMessages.length === 0" class="chat-empty">
          <p>Ask the agent to help with your document.</p>
          <p class="examples">Try: "Add a title" or "What's in this document?"</p>
        </div>
        <div
          v-for="msg in chatMessages"
          :key="msg.id"
          class="chat-message"
          :class="msg.role"
        >
          <div class="message-header">
            <span class="message-role">{{ msg.role === 'user' ? 'You' : 'Agent' }}</span>
            <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
          </div>
          <div class="message-content">{{ msg.content }}</div>
        </div>
      </div>

      <div class="chat-input-area">
        <textarea
          v-model="chatInput"
          @keydown="handleKeydown"
          placeholder="Ask the agent to modify the document..."
          :disabled="agentStatus === 'thinking'"
        ></textarea>
        <div class="chat-actions">
          <button class="clear-btn" @click="clearChat" title="Clear chat">Clear</button>
          <button
            class="send-btn"
            @click="sendMessage"
            :disabled="!chatInput.trim() || agentStatus === 'thinking'"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.app-container {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 20px 20px 20px;
  overflow: hidden;
}

.editor-area h1 {
  margin: 0 0 16px 0;
  font-size: 1.5rem;
  color: #333;
}

.editor-container {
  flex: 1;
  border: 1px solid #ccc;
  border-radius: 8px;
  overflow: auto;
}

.main-editor {
  height: 100%;
  min-height: 100%;
}

/* Chat Sidebar */
.chat-sidebar {
  width: 380px;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  background: #f9f9f9;
}

.chat-header {
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
  background: white;
}

.chat-header h2 {
  margin: 0 0 8px 0;
  font-size: 1.1rem;
  color: #333;
}

.agent-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: #666;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ccc;
}

.agent-status.ready .status-dot {
  background: #4caf50;
}

.agent-status.thinking .status-dot {
  background: #ff9800;
  animation: pulse 1s infinite;
}

.agent-status.offline .status-dot {
  background: #999;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.chat-empty {
  text-align: center;
  color: #888;
  padding: 40px 20px;
}

.chat-empty p {
  margin: 8px 0;
}

.chat-empty .examples {
  font-size: 0.85rem;
  color: #aaa;
}

.chat-message {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 8px;
  background: white;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.chat-message.user {
  background: #e3f2fd;
}

.chat-message.assistant {
  background: white;
  border: 1px solid #e0e0e0;
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 0.8rem;
}

.message-role {
  font-weight: 600;
  color: #333;
}

.message-time {
  color: #999;
}

.message-content {
  color: #444;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-input-area {
  padding: 16px;
  border-top: 1px solid #e0e0e0;
  background: white;
}

.chat-input-area textarea {
  width: 100%;
  height: 80px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  resize: none;
  font-family: inherit;
  font-size: 0.95rem;
}

.chat-input-area textarea:focus {
  outline: none;
  border-color: #2196f3;
}

.chat-input-area textarea:disabled {
  background: #f5f5f5;
}

.chat-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
}

.clear-btn {
  padding: 8px 16px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  color: #666;
}

.clear-btn:hover {
  background: #eee;
}

.send-btn {
  padding: 8px 24px;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
}

.send-btn:hover:not(:disabled) {
  background: #1976d2;
}

.send-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
