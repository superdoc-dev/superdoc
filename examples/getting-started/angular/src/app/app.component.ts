import { Component, ElementRef, ViewChild, OnDestroy, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SuperDoc } from 'superdoc';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app">
      <header class="header">
        <div class="room-info" *ngIf="roomId">
          <span class="room-label">Room:</span>
          <span class="room-id">{{ roomId }}</span>
          <button class="copy-btn" (click)="copyRoomUrl()">Copy URL</button>
        </div>
        <div class="header-right">
          <div class="header-actions">
            <button class="btn outlined" (click)="fileInput.click()">
              Import
            </button>
            <input
              #fileInput
              type="file"
              accept=".docx"
              (change)="onFileChange($event)"
              hidden
            />
            <button
              class="btn filled"
              (click)="exportDocument()"
            >
              Export
            </button>
          </div>
          <div class="mode-switcher">
          <button
            class="mode-btn"
            [class.active]="mode === 'editing'"
            (click)="setMode('editing')"
          >
            Edit
          </button>
          <button
            class="mode-btn"
            [class.active]="mode === 'suggesting'"
            (click)="setMode('suggesting')"
          >
            Suggest
          </button>
          <button
            class="mode-btn"
            [class.active]="mode === 'viewing'"
            (click)="setMode('viewing')"
          >
            View
          </button>
          </div>
        </div>
      </header>
      <main class="editor-area">
        <div class="editor-wrapper">
          <div id="superdoc-toolbar" class="toolbar-container"></div>
          <div #editor class="editor-container"></div>
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      .app {
        height: 100vh;
        display: flex;
        flex-direction: column;
        background: #f5f5f5;
      }

      .header {
        padding: 1rem 1.5rem;
        background: #1e2a3a;
        color: white;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .room-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .room-label {
        color: rgba(255, 255, 255, 0.6);
      }

      .room-id {
        background: rgba(255, 255, 255, 0.1);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
      }

      .copy-btn {
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
        background: rgba(255, 255, 255, 0.2);
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
      }

      .copy-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .header-right {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-left: auto;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .btn {
        padding: 0.625rem 1.5rem;
        font-size: 0.9375rem;
        font-weight: 500;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s;
        min-width: 100px;
      }

      .btn.outlined {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.4);
        color: white;
      }

      .btn.outlined:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.6);
      }

      .btn.filled {
        background: #2d3f52;
        border: 1px solid #3d5166;
        color: white;
      }

      .btn.filled:hover:not(:disabled) {
        background: #3d5166;
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .mode-switcher {
        display: flex;
        align-items: center;
        gap: 0;
        margin-left: 0.5rem;
      }

      .mode-btn {
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        font-weight: 500;
        border: 1px solid rgba(255, 255, 255, 0.3);
        background: transparent;
        color: rgba(255, 255, 255, 0.8);
        cursor: pointer;
        transition: all 0.15s;
      }

      .mode-btn:first-child {
        border-radius: 6px 0 0 6px;
      }

      .mode-btn:last-child {
        border-radius: 0 6px 6px 0;
      }

      .mode-btn:not(:first-child) {
        border-left: none;
      }

      .mode-btn:hover:not(.active) {
        background: rgba(255, 255, 255, 0.1);
        color: white;
      }

      .mode-btn.active {
        background: white;
        color: #1e2a3a;
        border-color: white;
      }

      .mode-btn.active + .mode-btn {
        border-left: 1px solid rgba(255, 255, 255, 0.3);
      }


      .editor-area {
        flex: 1;
        min-height: 0;
        overflow: hidden;
        background: #e8e8e8;
      }

      .editor-wrapper {
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      .toolbar-container {
        flex-shrink: 0;
        border-bottom: 1px solid #e5e7eb;
        background: white;
      }

      .editor-container {
        flex: 1;
        min-height: 0;
        overflow: auto;
        background: #e8e8e8;
        padding-top: 1rem;
        padding-left: 1rem;
        padding-right: 1rem;
        display: flex;
        justify-content: center;
      }

      .editor-container > * {
        flex-shrink: 0;
      }
    `,
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('editor', { static: true }) editorRef!: ElementRef;

  private superdoc: SuperDoc | null = null;
  private ydoc: Y.Doc | null = null;
  private provider: HocuspocusProvider | null = null;
  document: File | null = null;
  mode: 'editing' | 'suggesting' | 'viewing' = 'editing';
  isReady = false;
  roomId: string | null = null;

  constructor(private ngZone: NgZone) {}

  ngOnInit() {
    // Read room from URL query params
    const params = new URLSearchParams(window.location.search);
    this.roomId = params.get('room');

    // If there's a room in the URL, auto-connect to it
    if (this.roomId) {
      this.joinRoom(this.roomId);
    }
  }

  private hasSuperDocContent(ydoc: Y.Doc): boolean {
    return (
      ydoc.getXmlFragment('supereditor').length > 0 ||
      ydoc.getMap('parts').size > 0 ||
      ydoc.getMap('meta').has('docx')
    );
  }

  private joinRoom(roomId: string) {
    this.cleanup();

    // Create Y.js document and Hocuspocus provider for collaboration
    this.ydoc = new Y.Doc();
    this.provider = new HocuspocusProvider({
      url: 'ws://localhost:1234',
      name: roomId,
      document: this.ydoc,
    });

    // Wait for sync before creating SuperDoc
    const handleSynced = () => {
      if (this.superdoc) return;

      const hasContent = this.hasSuperDocContent(this.ydoc!);

      this.superdoc = new SuperDoc({
        selector: this.editorRef.nativeElement,
        documentMode: this.mode,
        toolbar: '#superdoc-toolbar',
        rulers: true,
        // Only provide a seed document if the room is empty
        ...(hasContent
          ? {}
          : {
              document: {
                id: roomId,
                type: 'docx' as const,
                url: '/sample.docx',
                name: 'sample.docx',
                isNewFile: true,
              },
            }),
        user: {
          name: 'User ' + Math.random().toString(36).substring(2, 5),
          email: 'user@example.com',
        },
        modules: {
          collaboration: {
            ydoc: this.ydoc!,
            provider: this.provider!,
          },
        },
        onReady: () => {
          this.ngZone.run(() => {
            this.isReady = true;
            this.document = new File([], 'collaborative-doc.docx');
          });
        },
      });
    };

    this.provider.on('synced', handleSynced);
  }

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  private updateUrlWithRoom(roomId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId);
    window.history.replaceState({}, '', url.toString());
  }

  copyRoomUrl() {
    navigator.clipboard.writeText(window.location.href);
  }

  onFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.document = file;
    this.isReady = false;
    this.cleanup();

    // Always generate a new room when importing a document
    this.roomId = this.generateRoomId();
    this.updateUrlWithRoom(this.roomId);

    // Create Y.js document and Hocuspocus provider
    this.ydoc = new Y.Doc();
    this.provider = new HocuspocusProvider({
      url: 'ws://localhost:1234',
      name: this.roomId,
      document: this.ydoc,
    });

    // Convert file to blob URL for collaboration
    const fileUrl = URL.createObjectURL(file);

    // Wait for provider to sync, then create SuperDoc
    this.provider.on('synced', () => {
      if (this.superdoc) return;

      this.superdoc = new SuperDoc({
        selector: this.editorRef.nativeElement,
        documentMode: this.mode,
        document: {
          id: this.roomId!,
          type: 'docx',
          url: fileUrl,
          name: file.name,
          isNewFile: true,
        },
        toolbar: '#superdoc-toolbar',
        rulers: true,
        user: {
          name: 'John Doe',
          email: 'john@example.com',
        },
        modules: {
          collaboration: {
            ydoc: this.ydoc!,
            provider: this.provider!,
          },
        },
        onReady: () => {
          this.ngZone.run(() => {
            this.isReady = true;
            // Clean up blob URL
            URL.revokeObjectURL(fileUrl);
          });
        },
      });
    });
  }

  private cleanup() {
    this.provider?.destroy();
    this.ydoc?.destroy();
    this.superdoc?.destroy();
    this.provider = null;
    this.ydoc = null;
    this.superdoc = null;
  }

  setMode(mode: 'editing' | 'suggesting' | 'viewing') {
    if (!this.superdoc) {
      alert('Please import a document first');
      return;
    }
    this.mode = mode;
    this.superdoc.setDocumentMode(mode);
  }

  async exportDocument() {
    if (!this.superdoc || !this.document) {
      alert('Please import a document first');
      return;
    }
    await this.superdoc.export({ triggerDownload: true });
  }

  ngOnDestroy() {
    this.cleanup();
  }
}
