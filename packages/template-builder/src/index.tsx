import { useRef, useState, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import type { SuperDoc } from 'superdoc';
import type * as Types from './types';
import { FieldMenu, FieldList } from './defaults';

export * from './types';
export { FieldMenu, FieldList };

type Editor = NonNullable<SuperDoc['activeEditor']>;

const getTemplateFieldsFromEditor = (editor: Editor): Types.TemplateField[] => {
  const structuredContentHelpers = (editor.helpers as any)?.structuredContentCommands;

  if (!structuredContentHelpers?.getStructuredContentTags) {
    return [];
  }

  const tags = structuredContentHelpers.getStructuredContentTags(editor.state) || [];

  return tags.map((entry: any) => {
    const node = entry?.node ?? entry;
    const attrs = node?.attrs ?? {};
    const nodeType = node?.type?.name || '';
    const mode = nodeType.includes('Block') ? 'block' : 'inline';

    return {
      id: attrs.id,
      alias: attrs.alias || attrs.label || '',
      tag: attrs.tag,
      mode,
      group: structuredContentHelpers.getGroup?.(attrs.tag) ?? undefined,
    } as Types.TemplateField;
  });
};

const areTemplateFieldsEqual = (a: Types.TemplateField[], b: Types.TemplateField[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];

    if (!right) return false;

    if (
      left.id !== right.id ||
      left.alias !== right.alias ||
      left.tag !== right.tag ||
      left.position !== right.position ||
      left.mode !== right.mode ||
      left.group !== right.group
    ) {
      return false;
    }
  }

  return true;
};

const resolveToolbar = (toolbar: Types.SuperDocTemplateBuilderProps['toolbar']) => {
  if (!toolbar) return null;

  if (toolbar === true) {
    return {
      selector: '#superdoc-toolbar',
      config: {} as Omit<Types.ToolbarConfig, 'selector'>,
      renderDefaultContainer: true,
    };
  }

  if (typeof toolbar === 'string') {
    return {
      selector: toolbar,
      config: {} as Omit<Types.ToolbarConfig, 'selector'>,
      renderDefaultContainer: false,
    };
  }

  const { selector, ...config } = toolbar;
  return {
    selector: selector || '#superdoc-toolbar',
    config,
    renderDefaultContainer: selector === undefined,
  };
};

const MENU_VIEWPORT_PADDING = 10;
const MENU_APPROX_WIDTH = 250;
const MENU_APPROX_HEIGHT = 300;

const clampToViewport = (rect: DOMRect): DOMRect => {
  const maxLeft = window.innerWidth - MENU_APPROX_WIDTH - MENU_VIEWPORT_PADDING;
  const maxTop = window.innerHeight - MENU_APPROX_HEIGHT - MENU_VIEWPORT_PADDING;

  const clampedLeft = Math.min(rect.left, maxLeft);
  const clampedTop = Math.min(rect.top, maxTop);

  return new DOMRect(
    Math.max(clampedLeft, MENU_VIEWPORT_PADDING),
    Math.max(clampedTop, MENU_VIEWPORT_PADDING),
    rect.width,
    rect.height,
  );
};

const SuperDocTemplateBuilder = forwardRef<Types.SuperDocTemplateBuilderHandle, Types.SuperDocTemplateBuilderProps>(
  (props, ref) => {
    const {
      document,
      fields = {},
      menu = {},
      list = {},
      toolbar,
      cspNonce,
      telemetry,
      licenseKey,
      onReady,
      onTrigger,
      onFieldInsert,
      onFieldUpdate,
      onFieldDelete,
      onFieldsChange,
      onFieldSelect,
      onFieldCreate,
      onExport,
      className,
      style,
      documentHeight = '600px',
    } = props;

    const [templateFields, setTemplateFields] = useState<Types.TemplateField[]>(fields.initial || []);
    const [selectedFieldId, setSelectedFieldId] = useState<string | number | null>(null);
    const [menuVisible, setMenuVisible] = useState(false);
    const [menuPosition, setMenuPosition] = useState<DOMRect | undefined>();
    const [menuQuery, setMenuQuery] = useState<string>('');
    const [menuFilteredFields, setMenuFilteredFields] = useState<Types.FieldDefinition[]>(() => fields.available || []);

    const containerRef = useRef<HTMLDivElement>(null);
    const superdocRef = useRef<SuperDoc | null>(null);
    const triggerCleanupRef = useRef<(() => void) | null>(null);
    const fieldsRef = useRef(fields);
    fieldsRef.current = fields;

    const menuTriggerFromRef = useRef<number | null>(null);
    const menuVisibleRef = useRef(menuVisible);
    useEffect(() => {
      menuVisibleRef.current = menuVisible;
    }, [menuVisible]);

    const trigger = menu.trigger || '{{';

    const availableFields = fieldsRef.current.available || [];
    const toolbarSettings = useMemo(() => resolveToolbar(toolbar), [toolbar]);
    const stableTelemetry = useMemo(
      () => ({
        enabled: telemetry?.enabled ?? true,
        metadata: { source: 'template-builder', ...telemetry?.metadata },
      }),
      [telemetry?.enabled, JSON.stringify(telemetry?.metadata)],
    );

    const computeFilteredFields = useCallback(
      (query: string) => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return availableFields;

        return availableFields.filter((field) => {
          const label = field.label.toLowerCase();
          return label.includes(normalized);
        });
      },
      [availableFields],
    );

    const updateMenuFilter = useCallback(
      (query: string) => {
        setMenuQuery(query);
        setMenuFilteredFields(computeFilteredFields(query));
      },
      [computeFilteredFields],
    );

    const resetMenuFilter = useCallback(() => {
      updateMenuFilter('');
    }, [updateMenuFilter]);

    const insertFieldInternal = useCallback(
      (mode: 'inline' | 'block', field: Partial<Types.FieldDefinition> & { alias: string }): boolean => {
        if (!superdocRef.current?.activeEditor) return false;

        const editor = superdocRef.current.activeEditor;
        const previousFields = templateFields;

        const success =
          mode === 'inline'
            ? editor.commands.insertStructuredContentInline?.({
                attrs: {
                  alias: field.alias,
                  tag: field.metadata ? JSON.stringify(field.metadata) : undefined,
                },
                text: field.defaultValue || field.alias,
              })
            : editor.commands.insertStructuredContentBlock?.({
                attrs: {
                  alias: field.alias,
                  tag: field.metadata ? JSON.stringify(field.metadata) : undefined,
                },
                text: field.defaultValue || field.alias,
              });

        if (success) {
          const updatedFields = getTemplateFieldsFromEditor(editor);

          setTemplateFields(updatedFields);
          onFieldsChange?.(updatedFields);

          const insertedField = updatedFields.find(
            (candidate) => !previousFields.some((existing) => existing.id === candidate.id),
          );

          if (insertedField) {
            onFieldInsert?.(insertedField);
          }
        }

        return success ?? false;
      },
      [onFieldInsert, onFieldsChange, templateFields],
    );

    const updateField = useCallback(
      (id: string | number, updates: Partial<Types.TemplateField>): boolean => {
        if (!superdocRef.current?.activeEditor) return false;

        const editor = superdocRef.current.activeEditor;
        const success = editor.commands.updateStructuredContentById?.(id, {
          attrs: updates,
        });

        if (success) {
          setTemplateFields((prev) => {
            const updated = prev.map((f) => (f.id === id ? { ...f, ...updates } : f));
            onFieldsChange?.(updated);
            const field = updated.find((f) => f.id === id);
            if (field) onFieldUpdate?.(field);
            return updated;
          });
        }

        return success ?? false;
      },
      [onFieldUpdate, onFieldsChange],
    );

    const deleteField = useCallback(
      (id: string | number): boolean => {
        const editor = superdocRef.current?.activeEditor;

        if (!editor) {
          let removed = false;
          setTemplateFields((prev) => {
            if (!prev.some((field) => field.id === id)) return prev;

            const updated = prev.filter((field) => field.id !== id);
            removed = true;
            onFieldsChange?.(updated);
            onFieldDelete?.(id);
            return updated;
          });

          if (removed) {
            setSelectedFieldId((current) => (current === id ? null : current));
          }

          return removed;
        }

        const fieldToDelete = templateFields.find((f) => f.id === id);
        const groupId = fieldToDelete?.group;

        let commandResult = false;
        try {
          commandResult = editor.commands.deleteStructuredContentById?.(id) ?? false;
        } catch (err) {
          console.warn('[TemplateBuilder] Failed to delete structured content:', id, err);
          commandResult = false;
        }

        let documentFields = getTemplateFieldsFromEditor(editor);
        const fieldStillPresent = documentFields.some((field) => field.id === id);

        if (!commandResult && fieldStillPresent) {
          documentFields = documentFields.filter((field) => field.id !== id);
        }

        if (groupId) {
          const remainingFieldsInGroup = documentFields.filter((field) => field.group === groupId);

          if (remainingFieldsInGroup.length === 1) {
            const lastField = remainingFieldsInGroup[0];
            editor.commands.updateStructuredContentById?.(lastField.id, {
              attrs: { tag: undefined },
            });
            documentFields = getTemplateFieldsFromEditor(editor);
          }
        }

        let removedFromState = false;

        setTemplateFields((prev) => {
          if (areTemplateFieldsEqual(prev, documentFields)) {
            return prev;
          }

          const prevHadField = prev.some((field) => field.id === id);
          const nextHasField = documentFields.some((field) => field.id === id);

          if (prevHadField && !nextHasField) {
            removedFromState = true;
          }

          onFieldsChange?.(documentFields);
          if (removedFromState) {
            onFieldDelete?.(id);
          }

          return documentFields;
        });

        if (removedFromState) {
          setSelectedFieldId((current) => (current === id ? null : current));
        }

        return commandResult || removedFromState;
      },
      [onFieldDelete, onFieldsChange, templateFields],
    );

    const selectField = useCallback(
      (id: string | number) => {
        if (!superdocRef.current?.activeEditor) return;

        const editor = superdocRef.current.activeEditor;
        editor.commands.selectStructuredContentById?.(id);
        setSelectedFieldId(id);

        const field = templateFields.find((f) => f.id === id);
        if (field) onFieldSelect?.(field);
      },
      [templateFields, onFieldSelect],
    );

    const discoverFields = useCallback(
      (editor: Editor) => {
        if (!editor) return;

        const discovered = getTemplateFieldsFromEditor(editor);

        setTemplateFields((prev) => {
          if (areTemplateFieldsEqual(prev, discovered)) {
            return prev;
          }

          onFieldsChange?.(discovered);
          return discovered;
        });
      },
      [onFieldsChange],
    );

    // Initialize SuperDoc - uses abort pattern to handle React 18 Strict Mode
    // which intentionally double-invokes effects to help identify cleanup issues
    useEffect(() => {
      if (!containerRef.current) return;

      let aborted = false;
      let instance: SuperDoc | null = null;

      const initSuperDoc = async () => {
        const { SuperDoc } = await import('superdoc');

        // If cleanup ran while we were importing, abort
        if (aborted) return;

        const modules: Record<string, unknown> = {
          comments: false,
          ...(toolbarSettings && {
            toolbar: {
              selector: toolbarSettings.selector,
              toolbarGroups: toolbarSettings.config.toolbarGroups || ['center'],
              excludeItems: toolbarSettings.config.excludeItems || [],
              ...toolbarSettings.config,
            },
          }),
        };

        const handleReady = () => {
          // Guard callback execution if cleanup already ran
          if (aborted) return;
          if (instance?.activeEditor) {
            const editor = instance.activeEditor;

            editor.on('update', ({ editor: e }: any) => {
              const { state } = e;
              const { from } = state.selection;

              if (from >= trigger.length) {
                const triggerStart = from - trigger.length;
                const text = state.doc.textBetween(triggerStart, from);

                if (text === trigger) {
                  const coords = e.view.coordsAtPos(from);
                  const bounds = clampToViewport(new DOMRect(coords.left, coords.top, 0, 0));

                  const cleanup = () => {
                    const editor = superdocRef.current?.activeEditor;
                    if (!editor) return;
                    const currentPos = editor.state.selection.from;
                    const tr = editor.state.tr.delete(triggerStart, currentPos);
                    (editor as any).view.dispatch(tr);
                  };

                  triggerCleanupRef.current = cleanup;
                  menuTriggerFromRef.current = from;
                  setMenuPosition(bounds);
                  setMenuVisible(true);
                  resetMenuFilter();

                  onTrigger?.({
                    position: { from: triggerStart, to: from },
                    bounds,
                    cleanup,
                  });

                  return;
                }
              }

              if (!menuVisibleRef.current) {
                return;
              }

              if (menuTriggerFromRef.current == null) {
                setMenuVisible(false);
                resetMenuFilter();
                return;
              }

              if (from < menuTriggerFromRef.current) {
                setMenuVisible(false);
                menuTriggerFromRef.current = null;
                resetMenuFilter();
                return;
              }

              const queryText = state.doc.textBetween(menuTriggerFromRef.current, from);
              updateMenuFilter(queryText);

              const coords = e.view.coordsAtPos(from);
              const bounds = clampToViewport(new DOMRect(coords.left, coords.top, 0, 0));
              setMenuPosition(bounds);
            });

            editor.on('update', () => {
              discoverFields(editor);
            });

            discoverFields(editor);
          }

          onReady?.();
        };

        instance = new SuperDoc({
          selector: containerRef.current!,
          document: document?.source,
          documentMode: document?.mode || 'editing',
          modules,
          toolbar: toolbarSettings?.selector,
          cspNonce,
          telemetry: stableTelemetry,
          ...(licenseKey && { licenseKey }),
          onReady: handleReady,
        });

        superdocRef.current = instance;
      };

      initSuperDoc();

      return () => {
        aborted = true;
        triggerCleanupRef.current = null;
        menuTriggerFromRef.current = null;

        if (instance) {
          if (typeof instance.destroy === 'function') {
            instance.destroy();
          }
        }

        superdocRef.current = null;
      };
    }, [
      document?.source,
      document?.mode,
      trigger,
      discoverFields,
      onReady,
      onTrigger,
      toolbarSettings,
      cspNonce,
      stableTelemetry,
      licenseKey,
    ]);

    const handleMenuSelect = useCallback(
      async (field: Types.FieldDefinition) => {
        if (triggerCleanupRef.current) {
          triggerCleanupRef.current();
          triggerCleanupRef.current = null;
        }
        menuTriggerFromRef.current = null;
        resetMenuFilter();

        const mode = field.mode || 'inline';

        if (field.id.startsWith('custom_') && onFieldCreate) {
          const createdField = await onFieldCreate(field);

          if (createdField) {
            const createdMode = createdField.mode || mode;
            insertFieldInternal(createdMode, {
              alias: createdField.label,
              metadata: createdField.metadata,
              defaultValue: createdField.defaultValue,
            });
            setMenuVisible(false);
            return;
          }
        }

        insertFieldInternal(mode, {
          alias: field.label,
          metadata: field.metadata,
          defaultValue: field.defaultValue,
        });
        setMenuVisible(false);
      },
      [insertFieldInternal, onFieldCreate, resetMenuFilter],
    );

    const handleSelectExisting = useCallback(
      (field: Types.TemplateField) => {
        if (triggerCleanupRef.current) {
          triggerCleanupRef.current();
          triggerCleanupRef.current = null;
        }
        menuTriggerFromRef.current = null;
        resetMenuFilter();

        const editor = superdocRef.current?.activeEditor;
        if (!editor) return;

        const structuredContentHelpers = (editor.helpers as any)?.structuredContentCommands;

        if (!structuredContentHelpers) return;

        const groupId = field.group || `group-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

        const tagWithGroup = structuredContentHelpers.createTagObject?.({
          group: groupId,
        });

        const mode = field.mode || 'inline';

        const success =
          mode === 'inline'
            ? editor.commands.insertStructuredContentInline?.({
                attrs: {
                  alias: field.alias,
                  tag: tagWithGroup,
                },
                text: field.alias,
              })
            : editor.commands.insertStructuredContentBlock?.({
                attrs: {
                  alias: field.alias,
                  tag: tagWithGroup,
                },
                text: field.alias,
              });

        if (success) {
          if (!field.group) {
            updateField(field.id, { tag: tagWithGroup });
          }

          setMenuVisible(false);

          const updatedFields = getTemplateFieldsFromEditor(editor);
          setTemplateFields(updatedFields);
          onFieldsChange?.(updatedFields);
        }
      },
      [updateField, resetMenuFilter, onFieldsChange],
    );

    const handleMenuClose = useCallback(() => {
      setMenuVisible(false);
      menuTriggerFromRef.current = null;
      resetMenuFilter();
      if (triggerCleanupRef.current) {
        triggerCleanupRef.current();
        triggerCleanupRef.current = null;
      }
    }, [resetMenuFilter]);

    const nextField = useCallback(() => {
      if (!superdocRef.current?.activeEditor || templateFields.length === 0) return;

      const currentIndex = templateFields.findIndex((f) => f.id === selectedFieldId);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % templateFields.length : 0;
      selectField(templateFields[nextIndex].id);
    }, [templateFields, selectedFieldId, selectField]);

    const previousField = useCallback(() => {
      if (!superdocRef.current?.activeEditor || templateFields.length === 0) return;

      const currentIndex = templateFields.findIndex((f) => f.id === selectedFieldId);
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : templateFields.length - 1;
      selectField(templateFields[prevIndex].id);
    }, [templateFields, selectedFieldId, selectField]);

    const exportTemplate = useCallback(
      async (config?: Types.ExportConfig): Promise<void | Blob> => {
        const { fileName = 'document', triggerDownload = true } = config || {};

        const result = await superdocRef.current?.export({
          exportType: ['docx'],
          exportedName: fileName,
          triggerDownload,
        });

        const editor = superdocRef.current?.activeEditor;
        if (editor) {
          const fields = getTemplateFieldsFromEditor(editor);
          const blob = triggerDownload ? undefined : (result as Blob);
          onExport?.({ fields, blob, fileName });
        }

        return result;
      },
      [onExport],
    );

    useImperativeHandle(ref, () => ({
      insertField: (field) => insertFieldInternal('inline', field),
      insertBlockField: (field) => insertFieldInternal('block', field),
      updateField,
      deleteField,
      selectField,
      nextField,
      previousField,
      getFields: () => templateFields,
      exportTemplate,
      getSuperDoc: () => superdocRef.current,
    }));

    const MenuComponent = menu.component || FieldMenu;
    const ListComponent = list.component || FieldList;

    return (
      <div className={`superdoc-template-builder ${className || ''}`} style={style}>
        <div style={{ display: 'flex', gap: '20px' }}>
          {list.position === 'left' && (
            <div className='superdoc-template-builder-sidebar'>
              <ListComponent
                fields={templateFields}
                onSelect={(field) => selectField(field.id)}
                onDelete={deleteField}
                onUpdate={(field) => updateField(field.id, field)}
                selectedFieldId={selectedFieldId || undefined}
              />
            </div>
          )}

          <div className='superdoc-template-builder-document' style={{ flex: 1 }}>
            {toolbarSettings?.renderDefaultContainer && (
              <div
                id='superdoc-toolbar'
                className='superdoc-template-builder-toolbar'
                data-testid='template-builder-toolbar'
              />
            )}
            <div
              ref={containerRef}
              className='superdoc-template-builder-editor'
              style={{ height: documentHeight }}
              data-testid='template-builder-editor'
            />
          </div>

          {list.position === 'right' && (
            <div className='superdoc-template-builder-sidebar'>
              <ListComponent
                fields={templateFields}
                onSelect={(field) => selectField(field.id)}
                onDelete={deleteField}
                onUpdate={(field) => updateField(field.id, field)}
                selectedFieldId={selectedFieldId || undefined}
              />
            </div>
          )}
        </div>

        <MenuComponent
          isVisible={menuVisible}
          position={menuPosition}
          availableFields={fields.available || []}
          filteredFields={menuFilteredFields}
          filterQuery={menuQuery}
          allowCreate={fields.allowCreate || false}
          onSelect={handleMenuSelect}
          onClose={handleMenuClose}
          onCreateField={onFieldCreate}
          existingFields={templateFields}
          onSelectExisting={handleSelectExisting}
        />
      </div>
    );
  },
);

SuperDocTemplateBuilder.displayName = 'SuperDocTemplateBuilder';

export default SuperDocTemplateBuilder;
