# @superdoc-dev/template-builder

React template building component for SuperDoc that enables document field management using structured content (SDT).

## Installation

```bash
npm install @superdoc-dev/template-builder
```

## Quick Start

```jsx
import SuperDocTemplateBuilder from '@superdoc-dev/template-builder';
import 'superdoc/style.css';

function TemplateEditor() {
  return (
    <SuperDocTemplateBuilder
      document={{
        source: 'template.docx',
        mode: 'editing',
      }}
      fields={{
        available: [
          { id: '1324567890', label: 'Customer Name' },
          { id: '1324567891', label: 'Invoice Date' },
          { id: '1324567892', label: 'Signature', mode: 'block', fieldType: 'signer' },
        ],
      }}
      onFieldInsert={(field) => {
        console.log('Field inserted:', field.alias, field.fieldType);
      }}
    />
  );
}
```

## Features

- **Trigger Detection** - Type `{{` (customizable) to insert fields
- **Field Management** - Insert, update, delete, and navigate fields
- **Field Discovery** - Automatically finds existing fields in documents
- **Field Types** - Distinguish owner vs signer fields with visual styling
- **Field Creation** - Allow users to create custom fields inline
- **Linked Fields** - Insert copies of existing fields that share a group
- **UI Agnostic** - Bring your own menus, panels, and components
- **SDT Based** - Uses structured content tags for Word compatibility
- **Export** - Download as `.docx` or get a Blob for API storage

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
    initial: TemplateField[],      // Pre-existing fields
    allowCreate: boolean,          // Show "Create New Field" in menu
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

  // Content Security Policy nonce (optional)
  cspNonce="abc123"

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
  onFieldCreate={(field) => {}}     // Called when user creates a custom field
  onExport={(event) => {}}          // Called after export with fields and blob
/>
```

### Ref Methods

```jsx
const ref = useRef<SuperDocTemplateBuilderHandle>(null);

// Insert fields
ref.current.insertField({ alias: 'Customer Name', fieldType: 'owner' });
ref.current.insertBlockField({ alias: 'Signature', fieldType: 'signer' });

// Update/delete fields
ref.current.updateField(fieldId, { alias: 'New Name' });
ref.current.deleteField(fieldId);

// Navigation
ref.current.selectField(fieldId);
ref.current.nextField();
ref.current.previousField();

// Get data
const fields = ref.current.getFields();
const blob = await ref.current.exportTemplate({ triggerDownload: false });

// Access SuperDoc instance
const superdoc = ref.current.getSuperDoc();
```

## Field Types

Fields can have a `fieldType` property to distinguish between different roles (e.g. `'owner'` vs `'signer'`). This is stored in the SDT tag metadata and flows through the entire system.

### Defining field types

```jsx
const availableFields = [
  { id: '1', label: 'Company Name', fieldType: 'owner' },
  { id: '2', label: 'Signer Name', fieldType: 'signer' },
  { id: '3', label: 'Date' },  // defaults to 'owner'
];
```

### Visual styling

Import the optional CSS to color-code fields in the editor by type:

```jsx
import '@superdoc-dev/template-builder/field-types.css';
```

Customize colors via CSS variables:

```css
:root {
  --superdoc-field-owner-color: #629be7;   /* default blue */
  --superdoc-field-signer-color: #d97706;  /* default amber */
}
```

### Accessing field type in callbacks

All field callbacks include `fieldType`:

```jsx
onFieldInsert={(field) => {
  console.log(field.fieldType); // 'owner' | 'signer' | ...
}}

onFieldsChange={(fields) => {
  const signerFields = fields.filter(f => f.fieldType === 'signer');
}}
```

## Custom Field Creation

Enable inline field creation in the dropdown menu:

```jsx
<SuperDocTemplateBuilder
  fields={{
    available: [...],
    allowCreate: true,
  }}
  onFieldCreate={async (field) => {
    // field.id starts with 'custom_'
    // field.fieldType is 'owner' or 'signer' (user-selected)
    const saved = await api.createField(field);
    return { ...field, id: saved.id }; // return modified field or void
  }}
/>
```

The create form lets users pick inline/block mode and owner/signer field type.

## Linked Fields (Groups)

When a user selects an existing field from the menu, a linked copy is inserted. Linked fields share a group ID and stay in sync. The menu shows an "Existing Fields" section with grouped entries.

When the last field in a group is deleted, the remaining field's group tag is automatically removed.

## Custom Components

### Field Menu

```jsx
const CustomFieldMenu = ({
  isVisible,
  position,
  availableFields,
  filteredFields,     // filtered by typed query after {{
  filterQuery,        // the query text
  allowCreate,
  existingFields,     // fields already in the document
  onSelect,
  onSelectExisting,
  onClose,
  onCreateField,
}) => {
  if (!isVisible) return null;

  return (
    <div style={{ position: 'fixed', left: position?.left, top: position?.top }}>
      {filteredFields.map((field) => (
        <button key={field.id} onClick={() => onSelect(field)}>
          {field.label} {field.fieldType && `(${field.fieldType})`}
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
          style={{ background: selectedFieldId === field.id ? 'lightblue' : 'white' }}
        >
          {field.alias} {field.fieldType && `[${field.fieldType}]`}
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
  const ref = useRef<SuperDocTemplateBuilderHandle>(null);

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

The `exportTemplate` method supports two modes via `ExportConfig`:

### Download Mode (Default)

```jsx
await ref.current?.exportTemplate();
await ref.current?.exportTemplate({ fileName: 'invoice-template' });
```

### Blob Mode (for Database/API)

```jsx
const blob = await ref.current?.exportTemplate({
  fileName: 'invoice-template',
  triggerDownload: false,
});

if (blob) {
  const formData = new FormData();
  formData.append('template', blob, 'invoice-template.docx');
  await fetch('/api/templates', { method: 'POST', body: formData });
}
```

### onExport Callback

Fires after every export with the field list and optional blob:

```jsx
<SuperDocTemplateBuilder
  onExport={(event) => {
    console.log(event.fields);    // TemplateField[]
    console.log(event.fileName);  // string
    console.log(event.blob);      // Blob | undefined (only in blob mode)
  }}
/>
```

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
  ExportEvent,
  FieldMenuProps,
  FieldListProps,
  SuperDocTemplateBuilderHandle,
} from '@superdoc-dev/template-builder';
```

## License

AGPLv3
