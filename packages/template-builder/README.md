# @superdoc-dev/template-builder

React template building component for SuperDoc that enables document field management using structured content (SDT).

## Installation

```bash
npm install @superdoc-dev/template-builder
```

## Quick Start

```jsx
import SuperDocTemplateBuilder from '@superdoc-dev/template-builder';
import 'superdoc/dist/style.css';

function TemplateEditor() {
  return (
    <SuperDocTemplateBuilder
      document={{
        source: 'template.docx',
        mode: 'editing',
      }}
      fields={{
        available: [
          { id: '1324567890', label: 'Customer Name', category: 'Contact' },
          { id: '1324567891', label: 'Invoice Date', category: 'Invoice' },
          { id: '1324567892', label: 'Amount', category: 'Invoice' },
        ],
      }}
      onTrigger={(event) => {
        console.log('User typed trigger at', event.position);
      }}
      onFieldInsert={(field) => {
        console.log('Field inserted:', field.alias);
      }}
    />
  );
}
```

## What You Receive

```javascript
{
  fields: [
    { id: "1324567890", alias: "Customer Name", tag: "contact" },
    { id: "1324567891", alias: "Invoice Date", tag: "invoice" }
  ],
  document: { /* ProseMirror document JSON */ }
}
```

## Features

- **🎯 Trigger Detection** - Type `{{` (customizable) to insert fields
- **📝 Field Management** - Insert, update, delete, and navigate fields
- **🔍 Field Discovery** - Automatically finds existing fields in documents
- **🎨 UI Agnostic** - Bring your own menus, panels, and components
- **📄 SDT Based** - Uses structured content tags for Word compatibility
- **⚡ Simple API** - Clear callbacks for trigger events and field changes

## API

### Component Props

```typescript
<SuperDocTemplateBuilder
  // Document configuration
  document={{
    source: File | Blob | string,
    mode: 'editing' | 'viewing'
  }}

  // Field configuration
  fields={{
    available: FieldDefinition[],  // Fields user can insert
    initial: TemplateField[]       // Pre-existing fields
  }}

  // UI components (optional)
  menu={{
    trigger: '{{',                  // Trigger pattern
    component: CustomFieldMenu      // Custom menu component
  }}

  list={{
    position: 'left' | 'right',    // Sidebar position
    component: CustomFieldList      // Custom list component
  }}

  // Toolbar (optional)
  toolbar={true}                   // Render built-in toolbar container
  // toolbar="#my-toolbar"          // Mount into existing element
  // toolbar={{                     // Configure built-in toolbar
  //   toolbarGroups: ['center'],
  //   excludeItems: ['italic', 'bold'],
  // }}

  // Telemetry (optional, enabled by default)
  telemetry={{ enabled: true, metadata: { source: 'template-builder' } }}

  // License key (optional)
  licenseKey="your-license-key"

  // Event handlers
  onReady={() => {}}
  onTrigger={(event) => {}}
  onFieldInsert={(field) => {}}
  onFieldUpdate={(field) => {}}
  onFieldDelete={(fieldId) => {}}
  onFieldsChange={(fields) => {}}
  onFieldSelect={(field) => {}}
/>
```

### Ref Methods

```jsx
const ref = useRef();

// Insert fields
ref.current.insertField({ alias: 'Customer Name' });
ref.current.insertBlockField({ alias: 'Terms Block' });

// Update/delete fields
ref.current.updateField(fieldId, { alias: 'New Name' });
ref.current.deleteField(fieldId);

// Navigation
ref.current.selectField(fieldId);
ref.current.nextField(); // Tab behavior
ref.current.previousField(); // Shift+Tab behavior

// Get data
const fields = ref.current.getFields();
const template = await ref.current.exportTemplate();
```

## Custom Components

### Field Menu

```jsx
const CustomFieldMenu = ({ isVisible, position, availableFields, onSelect, onClose }) => {
  if (!isVisible) return null;

  return (
    <div style={{ position: 'fixed', left: position?.left, top: position?.top }}>
      {availableFields.map((field) => (
        <button key={field.id} onClick={() => onSelect(field)}>
          {field.label}
        </button>
      ))}
      <button onClick={onClose}>Cancel</button>
    </div>
  );
};
```

### Field List

```jsx
const CustomFieldList = ({ fields, onSelect, onDelete, selectedFieldId }) => {
  return (
    <div>
      <h3>Fields ({fields.length})</h3>
      {fields.map((field) => (
        <div
          key={field.id}
          onClick={() => onSelect(field)}
          style={{ background: selectedFieldId === field.id ? '#blue' : '#gray' }}
        >
          {field.alias}
          <button onClick={() => onDelete(field.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
};
```

## Field Navigation

Enable Tab/Shift+Tab navigation:

```jsx
function TemplateEditor() {
  const ref = useRef();

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        ref.current?.previousField();
      } else {
        ref.current?.nextField();
      }
    }
  };

  return (
    <div onKeyDown={handleKeyDown}>
      <SuperDocTemplateBuilder ref={ref} {...props} />
    </div>
  );
}
```

## Export Template

The `exportTemplate` method supports two modes of operation via the `ExportConfig` interface:

### 1. Download Mode (Default)

Automatically downloads the template as a file in the browser:

```jsx
const handleDownload = async () => {
  // Download with default filename "document.docx"
  await ref.current?.exportTemplate();

  // Or with custom filename
  await ref.current?.exportTemplate({
    fileName: 'invoice-template.docx',
  });
};
```

### 2. Blob Mode (for Database/API)

Get the template as a Blob for saving to your database or API:

```jsx
const handleSave = async () => {
  // Get the blob without triggering download
  const blob = await ref.current?.exportTemplate({
    fileName: 'invoice-template.docx',
    triggerDownload: false,
  });

  if (blob) {
    // Send to your API/database
    const formData = new FormData();
    formData.append('template', blob, 'invoice-template.docx');

    await fetch('/api/templates', {
      method: 'POST',
      body: formData,
    });
  }
};
```

### ExportConfig Interface

```typescript
interface ExportConfig {
  fileName?: string;         // Default: "document"
  triggerDownload?: boolean; // Default: true
}

// Method signature
exportTemplate(config?: ExportConfig): Promise<void | Blob>
```

**Return value:**

- `Promise<void>` when `triggerDownload: true` (download happens automatically)
- `Promise<Blob>` when `triggerDownload: false` (returns the docx data)

## Telemetry

Telemetry is enabled by default with `source: 'template-builder'` metadata. You can override or extend the configuration:

```jsx
<SuperDocTemplateBuilder
  telemetry={{ enabled: true, metadata: { source: 'my-app', environment: 'production' } }}
/>
```

For more details, see the [Telemetry](https://docs.superdoc.dev/resources/telemetry) documentation.

## TypeScript

Full TypeScript support included:

```typescript
import SuperDocTemplateBuilder from '@superdoc-dev/template-builder';
import type {
  TemplateField,
  FieldDefinition,
  TriggerEvent,
  ExportConfig,
  SuperDocTemplateBuilderHandle,
} from '@superdoc-dev/template-builder';

const ref = useRef<SuperDocTemplateBuilderHandle>(null);
```

## License

AGPLv3
