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
const lastUserMessageTime = ref(null);

const USER_COLORS = ['#a11134', '#2a7e34', '#b29d11', '#2f4597', '#ab5b22'];

const initSuperDoc = () => {
  console.log('[Client] Initializing SuperDoc');

  superdoc.value = new SuperDoc({
    selector: '#superdoc',
    toolbar: '#superdoc-toolbar',
    toolbarGroups: ['center'],
    document: {
      id: DOCUMENT_ID,
      type: 'docx',
      url: sampleDocument,
      isNewFile: true,
    },
    layoutEngineOptions: {
      flowMode: 'semantic',
    },
    colors: USER_COLORS,
    user: generateUserInfo(),
    modules: {
      collaboration: {
        url: `${COLLAB_URL}`,
        token: 'token',
      },
      toolbar: {
        excludeItems: ['link', 'table', 'image'],
      },
    },
  });
};

const initChat = () => {
  const chatUrl = `${CHAT_URL}/${DOCUMENT_ID}`;
  const ws = new WebSocket(chatUrl);
  chatWs.value = ws;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'clear' }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'init') {
        chatMessages.value = data.messages || [];
        agentStatus.value = data.agentStatus || 'offline';
        scrollToBottom();
      } else if (data.type === 'message') {
        const msg = data.message;
        if (msg.role === 'assistant' && lastUserMessageTime.value) {
          msg.duration = Date.now() - lastUserMessageTime.value;
          lastUserMessageTime.value = null;
        }
        chatMessages.value.push(msg);
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

  ws.onclose = () => {
    agentStatus.value = 'offline';
  };
};

const sendMessage = (content) => {
  const text = content || chatInput.value.trim();
  if (!text || !chatWs.value) return;

  if (chatWs.value.readyState !== WebSocket.OPEN) {
    initChat();
    return;
  }

  const message = {
    id: `user-${Date.now()}`,
    role: 'user',
    content: text,
    timestamp: Date.now(),
  };

  lastUserMessageTime.value = Date.now();
  chatMessages.value.push(message);
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
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
  <div class="app-wrapper">
    <!-- Top Header Bar -->
    <header class="top-header">
      <div class="logo">
        <img src="/logo.webp" alt="SuperDoc" class="logo-img" />
        <span class="logo-text">SuperDoc</span>
      </div>
    </header>

    <div class="main-content">
      <!-- Editor Area -->
      <div class="editor-area">
        <div id="superdoc-toolbar" class="editor-toolbar"></div>
        <div class="editor-container">
          <div id="superdoc" class="main-editor"></div>
        </div>
      </div>

      <!-- Agent Sidebar -->
      <aside class="agent-sidebar">
        <div class="agent-header">
          <div class="agent-title">
            <svg class="agent-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <span>Document Agent</span>
          </div>
          <div class="agent-status" :class="agentStatus">
            <span class="status-dot"></span>
            <span>{{ agentStatus === 'thinking' ? 'Thinking...' : agentStatus === 'ready' ? 'Ready' : 'Offline' }}</span>
          </div>
        </div>

        <!-- Chat Messages -->
        <div class="chat-messages" ref="chatContainer">
          <div
            v-for="msg in chatMessages"
            :key="msg.id"
            class="chat-message"
            :class="msg.role"
          >
            <div class="message-avatar">
              <div v-if="msg.role === 'user'" class="avatar user-avatar">U</div>
              <div v-else class="avatar agent-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                </svg>
              </div>
            </div>
            <div class="message-body">
              <div class="message-header">
                <span class="message-name">{{ msg.role === 'user' ? 'You' : 'Agent' }}</span>
                <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
              </div>
              <div class="message-content">{{ msg.content }}</div>
            </div>
          </div>

          <!-- Typing indicator -->
          <div v-if="agentStatus === 'thinking'" class="chat-message assistant typing">
            <div class="message-avatar">
              <div class="avatar agent-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                </svg>
              </div>
            </div>
            <div class="message-body">
              <div class="message-header">
                <span class="message-name">Agent</span>
                <span class="typing-indicator">is typing...</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Chat Input -->
        <div class="chat-input-area">
          <input
            type="text"
            v-model="chatInput"
            @keydown="handleKeydown"
            placeholder="Ask the agent..."
            :disabled="agentStatus === 'thinking'"
          />
          <button
            class="send-btn"
            @click="sendMessage()"
            :disabled="!chatInput.trim() || agentStatus === 'thinking'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
      </aside>
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
  background: #f5f5f5;
}

.app-wrapper {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow: hidden;
}

/* Top Header */
.top-header {
  display: flex;
  align-items: center;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-img {
  width: 28px;
  height: 28px;
}

.logo-text {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1e293b;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 600;
  color: white;
}

/* Main Content */
.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

/* Editor Area */
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #fdf2f8 0%, #ede9fe 50%, #dbeafe 100%);
  min-width: 0;
  overflow: hidden;
}

.editor-toolbar {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  padding: 8px 16px;
  flex-shrink: 0;
}

.editor-container {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 24px;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.editor-container::-webkit-scrollbar {
  display: none;
}

.main-editor {
  width: 100%;
  max-width: 850px;
}

#superdoc .superdoc {
  padding-bottom: 120px;
}

/* Agent Sidebar */
.agent-sidebar {
  width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-left: 1px solid #e5e7eb;
  overflow: hidden;
}

.agent-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.agent-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 6px;
}

.agent-icon {
  width: 20px;
  height: 20px;
  color: #3b82f6;
}

.agent-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: #64748b;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9ca3af;
}

.agent-status.ready .status-dot {
  background: #22c55e;
}

.agent-status.thinking .status-dot {
  background: #f59e0b;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Chat Messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 0;
}

.chat-message {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.message-avatar .avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
}

.user-avatar {
  background: #3b82f6;
}

.agent-avatar {
  background: #f1f5f9;
  color: #3b82f6;
}

.agent-avatar svg {
  width: 18px;
  height: 18px;
}

.message-body {
  flex: 1;
  min-width: 0;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.message-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1e293b;
}

.message-time {
  font-size: 0.75rem;
  color: #9ca3af;
}

.typing-indicator {
  font-size: 0.8rem;
  color: #3b82f6;
  font-style: italic;
}

.message-content {
  font-size: 0.9rem;
  color: #374151;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-message.user .message-content {
  background: #eff6ff;
  padding: 10px 14px;
  border-radius: 12px;
  border-top-left-radius: 4px;
}

.chat-message.assistant .message-content {
  background: #f8fafc;
  padding: 10px 14px;
  border-radius: 12px;
  border-top-left-radius: 4px;
}

/* Chat Input */
.chat-input-area {
  display: flex;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  flex-shrink: 0;
}

.chat-input-area input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.9rem;
  color: #1e293b;
  background: #f9fafb;
  transition: all 0.15s;
}

.chat-input-area input::placeholder {
  color: #9ca3af;
}

.chat-input-area input:focus {
  outline: none;
  border-color: #3b82f6;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.chat-input-area input:disabled {
  background: #f1f5f9;
  color: #9ca3af;
}

.send-btn {
  width: 40px;
  height: 40px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3b82f6;
  border: none;
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.15s;
}

.send-btn svg {
  width: 18px;
  height: 18px;
}

.send-btn:hover:not(:disabled) {
  background: #2563eb;
}

.send-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

/* Responsive */
@media (max-width: 900px) {
  .main-content {
    flex-direction: column;
  }

  .agent-sidebar {
    width: 100%;
    max-height: 50vh;
    border-left: none;
    border-top: 1px solid #e5e7eb;
  }
}
</style>
