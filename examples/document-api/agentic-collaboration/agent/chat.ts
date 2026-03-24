/**
 * Chat WebSocket client for agent communication.
 */

import WebSocket from 'ws';

type MessageHandler = (userMessage: string) => Promise<string>;

export class Chat {
  private url: string;
  private ws!: WebSocket;
  private processing = false;
  private queue: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<this> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.on('open', () => resolve(this));
      this.ws.on('error', reject);
    });
  }

  serve(handler: MessageHandler): this {
    this.ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'message' && msg.message?.role === 'user') {
        this.queue.push(msg.message.content);
        this.processQueue(handler);
      }
    });
    this.setStatus('ready');
    return this;
  }

  private async processQueue(handler: MessageHandler): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    while (this.queue.length > 0) {
      const content = this.queue.shift()!;
      this.setStatus('thinking');
      try {
        const response = await handler(content);
        this.send(response);
      } catch (err) {
        console.error('[Agent] Error:', err);
        this.send('Sorry, I encountered an error.');
      }
    }
    this.setStatus('ready');
    this.processing = false;
  }

  send(content: string): this {
    this.ws.send(JSON.stringify({
      type: 'message',
      role: 'assistant',
      id: `agent-${Date.now()}`,
      content,
      timestamp: Date.now(),
    }));
    return this;
  }

  setStatus(status: string): this {
    this.ws.send(JSON.stringify({ type: 'status', status }));
    return this;
  }

  close() {
    this.setStatus('offline');
    this.ws.close();
  }
}
