import { describe, it, expect, beforeEach, vi, afterEach } from 'vite-plus/test';
import { createPinia, setActivePinia, defineStore } from 'pinia';
import { ref, reactive } from 'vue';

vi.mock('./superdoc-store.js', () => {
  const documents = ref([]);
  const user = reactive({ name: 'Tester', email: 'tester@example.com' });
  const activeSelection = reactive({ documentId: null, selectionBounds: {} });
  const selectionPosition = reactive({ source: null });
  const getDocument = (id) => documents.value.find((doc) => doc.id === id);

  const useMockStore = defineStore('superdoc', () => ({
    documents,
    user,
    activeSelection,
    selectionPosition,
    getDocument,
  }));

  return {
    useSuperdocStore: useMockStore,
    __mockSuperdoc: {
      documents,
      user,
      activeSelection,
      selectionPosition,
    },
  };
});

function componentStub(name) {
  return { default: { name } };
}
vi.mock('@superdoc/components/HrbrFieldsLayer/TextField.vue', () => componentStub('TextField'));
vi.mock('@superdoc/components/HrbrFieldsLayer/ParagraphField.vue', () => componentStub('ParagraphField'));
vi.mock('@superdoc/components/HrbrFieldsLayer/ImageField.vue', () => componentStub('ImageField'));
vi.mock('@superdoc/components/HrbrFieldsLayer/CheckboxField.vue', () => componentStub('CheckboxField'));
vi.mock('@superdoc/components/HrbrFieldsLayer/SelectField.vue', () => componentStub('SelectField'));

import { useHrbrFieldsStore } from './hrbr-fields-store.js';
import { __mockSuperdoc } from './superdoc-store.js';

describe('hrbr-fields-store', () => {
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useHrbrFieldsStore();
    __mockSuperdoc.documents.value = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a field by document and field id', () => {
    __mockSuperdoc.documents.value = [
      {
        id: 'doc-1',
        fields: [
          { id: 'field-1', label: 'Field One' },
          { id: 'field-2', label: 'Field Two' },
        ],
      },
    ];

    expect(store.getField('doc-1', 'field-2')).toEqual({ id: 'field-2', label: 'Field Two' });
    expect(store.getField('doc-1', 'missing')).toBeUndefined();
    expect(store.getField('missing', 'field-1')).toBeUndefined();
  });

  it('maps annotations to positioned fields', () => {
    const pageElementBounds = { height: 300, bottom: 310, left: 42 };
    const pageElement = { getBoundingClientRect: () => pageElementBounds };
    const getElementSpy = vi.spyOn(document, 'getElementById').mockReturnValue(pageElement);

    __mockSuperdoc.documents.value = [
      {
        id: 'doc-1',
        fields: [{ id: 'field-1' }],
        annotations: [
          {
            itemid: 'field-1',
            page: 0,
            nostyle: false,
            pageannotation: 'page-ann-1',
            annotationid: 'ann-1',
            itemfieldtype: 'TEXTINPUT',
            x1: 10,
            y1: 20,
            x2: 40,
            y2: 60,
            original_font_size: 12,
            fontfamily: 'Roboto',
          },
        ],
        container: {
          getBoundingClientRect: () => ({ top: 10, bottom: 110, left: 20 }),
        },
        pageContainers: [
          {
            page: 0,
            containerBounds: { originalHeight: 200 },
          },
        ],
      },
    ];

    const annotations = store.getAnnotations;

    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({
      documentId: 'doc-1',
      fieldId: 'field-1',
      annotationId: 'page-ann-1',
      style: {
        fontSize: '18pt',
        fontFamily: 'Roboto',
        coordinates: {
          top: '210px',
          left: '37px',
          minWidth: '45px',
          minHeight: '60px',
        },
      },
    });

    getElementSpy.mockRestore();
  });
});
