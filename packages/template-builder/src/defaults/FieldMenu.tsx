import { useEffect, useMemo, useState } from 'react';
import type { FieldDefinition, FieldMenuProps } from '../types';

export const FieldMenu: React.FC<FieldMenuProps> = ({
  isVisible,
  position,
  availableFields,
  filteredFields,
  filterQuery,
  allowCreate,
  onSelect,
  onClose,
  onCreateField,
  existingFields = [],
  onSelectExisting,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [fieldMode, setFieldMode] = useState<'inline' | 'block'>('inline');
  const [existingExpanded, setExistingExpanded] = useState(true);
  const [availableExpanded, setAvailableExpanded] = useState(true);

  useEffect(() => {
    if (!isVisible) {
      setIsCreating(false);
      setNewFieldName('');
      setFieldMode('inline');
    }
  }, [isVisible]);

  const menuStyle = useMemo(() => {
    return {
      position: 'absolute' as const,
      left: position?.left,
      top: position?.top,
      zIndex: 1000,
      background: 'white',
      border: '1px solid #ddd',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      padding: '8px 0',
      width: '280px',
    };
  }, [position]);

  const fieldsToDisplay = filteredFields ?? availableFields;
  const hasFilter = Boolean(filterQuery);

  useEffect(() => {
    if (hasFilter) {
      setAvailableExpanded(true);
    }
  }, [hasFilter]);

  if (!isVisible) return null;

  const handleCreateField = async () => {
    const trimmedName = newFieldName.trim();
    if (!trimmedName) return;

    const newField: FieldDefinition = {
      id: `custom_${Date.now()}`,
      label: trimmedName,
      mode: fieldMode,
    };

    try {
      if (onCreateField) {
        const result = await onCreateField(newField);
        void onSelect(result || newField);
      } else {
        void onSelect(newField);
      }
    } finally {
      setIsCreating(false);
      setNewFieldName('');
      setFieldMode('inline');
    }
  };

  return (
    <div className='superdoc-field-menu' style={menuStyle}>
      {hasFilter && (
        <div
          style={{
            padding: '8px 16px',
            borderBottom: '1px solid #f0f0f0',
            marginBottom: '4px',
          }}
        >
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            Filtering results for
            <span style={{ fontWeight: 600, color: '#111827', marginLeft: '4px' }}>{filterQuery}</span>
          </div>
        </div>
      )}

      {allowCreate && !isCreating && (
        <div
          className='field-menu-item'
          onClick={() => setIsCreating(true)}
          style={{
            padding: '8px 16px',
            cursor: 'pointer',
            color: '#0066cc',
            fontWeight: 500,
          }}
        >
          + Create New Field
        </div>
      )}

      {allowCreate && isCreating && (
        <div style={{ padding: '8px 16px' }}>
          <input
            type='text'
            value={newFieldName}
            placeholder='Field name...'
            onChange={(event) => setNewFieldName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleCreateField();
              if (event.key === 'Escape') {
                setIsCreating(false);
                setNewFieldName('');
                setFieldMode('inline');
              }
            }}
            autoFocus
            style={{
              width: '100%',
              padding: '4px 8px',
              border: '1px solid #ddd',
              borderRadius: '3px',
            }}
          />
          <div
            style={{
              marginTop: '8px',
              display: 'flex',
              gap: '12px',
              fontSize: '13px',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <input
                type='radio'
                value='inline'
                checked={fieldMode === 'inline'}
                onChange={() => setFieldMode('inline')}
              />
              Inline
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <input
                type='radio'
                value='block'
                checked={fieldMode === 'block'}
                onChange={() => setFieldMode('block')}
              />
              Block
            </label>
          </div>
          <div
            style={{
              marginTop: '8px',
              display: 'flex',
              gap: '8px',
            }}
          >
            <button
              onClick={handleCreateField}
              disabled={!newFieldName.trim()}
              style={{
                padding: '4px 12px',
                background: newFieldName.trim() ? '#0066cc' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: newFieldName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Create
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewFieldName('');
                setFieldMode('inline');
              }}
              style={{
                padding: '4px 12px',
                background: 'white',
                border: '1px solid #ddd',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {allowCreate && availableFields.length > 0 && (
        <div
          style={{
            borderTop: '1px solid #eee',
            margin: '4px 0',
          }}
        />
      )}

      {existingFields.length > 0 &&
        (() => {
          const groupedExisting = new Map<string | undefined, typeof existingFields>();

          existingFields.forEach((field) => {
            const key = field.group || `individual-${field.id}`;
            const existing = groupedExisting.get(key) || [];
            existing.push(field);
            groupedExisting.set(key, existing);
          });

          const uniqueEntries = Array.from(groupedExisting.values()).map((fields) => {
            const representative = fields[0];
            return {
              ...representative,
              count: fields.length,
            };
          });

          return (
            <div style={{ borderBottom: '1px solid #f0f0f0' }}>
              <button
                type='button'
                onClick={() => setExistingExpanded(!existingExpanded)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 16px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '13px',
                  color: '#374151',
                  textAlign: 'left',
                }}
              >
                <span>Existing Fields ({uniqueEntries.length})</span>
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRight: '2px solid #666',
                    borderBottom: '2px solid #666',
                    transform: existingExpanded ? 'rotate(45deg)' : 'rotate(-45deg)',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </button>
              {existingExpanded && (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {uniqueEntries.map((entry) => (
                    <div
                      key={entry.group || entry.id}
                      className='field-menu-item'
                      onClick={() => onSelectExisting?.(entry)}
                      style={{
                        padding: '8px 16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{entry.alias || entry.id}</div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#9ca3af',
                            marginTop: '2px',
                          }}
                        >
                          {entry.group ? `group (${entry.count} fields)` : `ID: ${entry.id}`}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          padding: '2px 6px',
                          background: '#f3f4f6',
                          borderRadius: '3px',
                          textTransform: 'capitalize',
                          flexShrink: 0,
                        }}
                      >
                        {entry.mode || 'inline'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

      {fieldsToDisplay.length === 0 ? (
        <div
          style={{
            padding: '16px',
            fontSize: '13px',
            color: '#6b7280',
            textAlign: 'center',
          }}
        >
          No matching fields
        </div>
      ) : (
        <div style={{ borderBottom: '1px solid #f0f0f0' }}>
          <button
            type='button'
            onClick={() => setAvailableExpanded(!availableExpanded)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: '13px',
              color: '#374151',
              textAlign: 'left',
            }}
          >
            <span>Available Fields ({fieldsToDisplay.length})</span>
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRight: '2px solid #666',
                borderBottom: '2px solid #666',
                transform: availableExpanded ? 'rotate(45deg)' : 'rotate(-45deg)',
                transition: 'transform 0.2s ease',
              }}
            />
          </button>
          {availableExpanded && (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {fieldsToDisplay.map((field) => (
                <div
                  key={field.id}
                  className='field-menu-item'
                  onClick={() => onSelect(field)}
                  style={{
                    padding: '8px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{field.label || field.id}</div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#9ca3af',
                        marginTop: '2px',
                      }}
                    >
                      ID: {field.id}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#6b7280',
                      padding: '2px 6px',
                      background: '#f3f4f6',
                      borderRadius: '3px',
                      textTransform: 'capitalize',
                      flexShrink: 0,
                    }}
                  >
                    {field.mode || 'inline'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          borderTop: '1px solid #eee',
          marginTop: '4px',
        }}
      >
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '6px 16px',
            background: '#f3f4f6',
            border: 'none',
            borderRadius: '0 0 4px 4px',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};
