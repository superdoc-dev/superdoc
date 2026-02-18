import type { FC } from 'react';
import { useMemo, useState } from 'react';
import type { FieldListProps, TemplateField } from '../types';

const shortenGroupId = (group: string): string => {
  const parts = group.split('-');
  return parts.length > 2 ? parts[parts.length - 1].substring(0, 6) : group.substring(0, 6);
};
const FieldItem: FC<{
  field: TemplateField;
  onSelect: (field: TemplateField) => void;
  onDelete: (id: string | number) => void;
  isSelected: boolean;
  isGrouped?: boolean;
}> = ({ field, onSelect, onDelete, isSelected, isGrouped = false }) => {
  return (
    <div
      onClick={() => onSelect(field)}
      style={{
        position: 'relative',
        padding: '10px 12px',
        background: isSelected ? '#eff6ff' : '#f9fafb',
        border: isSelected ? '1px solid #3b82f6' : '1px solid #e5e7eb',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontSize: isGrouped ? '13px' : '14px',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = '#f3f4f6';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = '#f9fafb';
        }
      }}
      title={field.alias}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(field.id);
        }}
        style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          padding: '4px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#9ca3af',
          transition: 'color 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#ef4444';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#9ca3af';
        }}
        title='Delete field'
      >
        <svg width='14' height='14' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'>
          <path
            d='M6 2V1.5C6 1.22386 6.22386 1 6.5 1H9.5C9.77614 1 10 1.22386 10 1.5V2M2 4H14M12.6667 4L12.1991 11.0129C12.129 12.065 12.0939 12.5911 11.8667 12.99C11.6666 13.3412 11.3648 13.6235 11.0011 13.7998C10.588 14 10.0607 14 9.00623 14H6.99377C5.93927 14 5.41202 14 4.99889 13.7998C4.63517 13.6235 4.33339 13.3412 4.13332 12.99C3.90607 12.5911 3.871 12.065 3.80086 11.0129L3.33333 4'
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      </button>
      <div style={{ paddingRight: '24px' }}>
        <div
          style={{
            fontWeight: '500',
            fontSize: isGrouped ? '12px' : '14px',
            color: isGrouped ? '#6b7280' : '#111827',
          }}
        >
          {field.alias || field.id}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: '#9ca3af',
            marginTop: '2px',
          }}
        >
          <span>ID: {field.id}</span>
          {field.mode && (
            <span
              style={{
                fontSize: '9px',
                padding: '2px 5px',
                borderRadius: '3px',
                background: field.mode === 'block' ? '#dbeafe' : '#f3f4f6',
                color: field.mode === 'block' ? '#1e40af' : '#4b5563',
                fontWeight: '500',
              }}
            >
              {field.mode}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const FieldList: FC<FieldListProps> = ({ fields, onSelect, onDelete, selectedFieldId }) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { groupedFields, ungroupedFields } = useMemo(() => {
    const grouped: Record<string, typeof fields> = {};
    const ungrouped: typeof fields = [];

    fields.forEach((field) => {
      if (field.group) {
        if (!grouped[field.group]) {
          grouped[field.group] = [];
        }
        grouped[field.group].push(field);
      } else {
        ungrouped.push(field);
      }
    });

    return { groupedFields: grouped, ungroupedFields: ungrouped };
  }, [fields]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return (
    <div
      className='superdoc-field-list'
      style={{
        width: '250px',
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '16px',
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>Template Fields ({fields.length})</h3>

      {fields.length === 0 ? (
        <div
          style={{
            color: '#9ca3af',
            fontSize: '14px',
            textAlign: 'center',
            padding: '20px 0',
          }}
        >
          No fields yet. Type {'{{'} to add a field.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ungroupedFields.map((field) => (
            <FieldItem
              key={field.id}
              field={field}
              onSelect={onSelect}
              onDelete={onDelete}
              isSelected={selectedFieldId === field.id}
            />
          ))}

          {Object.entries(groupedFields).map(([groupId, groupFields]) => {
            const isExpanded = expandedGroups.has(groupId);
            const firstField = groupFields[0];

            return (
              <div key={groupId}>
                <div
                  style={{
                    position: 'relative',
                    padding: '12px',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onClick={() => toggleGroup(groupId)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f9fafb';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>{isExpanded ? '▼' : '▶'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '500', fontSize: '14px' }}>{firstField.alias}</div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#9ca3af',
                          marginTop: '2px',
                        }}
                      >
                        group: {shortenGroupId(groupId)} ({groupFields.length} fields)
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div
                    style={{
                      marginLeft: '16px',
                      marginTop: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {groupFields.map((field) => (
                      <FieldItem
                        key={field.id}
                        field={field}
                        onSelect={onSelect}
                        onDelete={onDelete}
                        isSelected={selectedFieldId === field.id}
                        isGrouped
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
