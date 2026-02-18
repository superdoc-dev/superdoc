import { Component, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { SuperDoc } from 'superdoc';

@Component({
  selector: 'app-root',
  template: `
    <div style="padding: 1rem; background: #f5f5f5">
      <input type="file" accept=".docx" (change)="onFileChange($event)" />
    </div>
    <div #editor style="height: calc(100vh - 60px)"></div>
  `,
})
export class AppComponent implements OnDestroy {
  @ViewChild('editor', { static: true }) editorRef!: ElementRef;

  private superdoc: SuperDoc | null = null;

  onFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.superdoc?.destroy();
    this.superdoc = new SuperDoc({
      selector: this.editorRef.nativeElement,
      documentMode: 'editing',
      document: file,
    });
  }

  ngOnDestroy() {
    this.superdoc?.destroy();
  }
}
