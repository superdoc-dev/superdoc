import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuperConverter } from './SuperConverter.js';
import { v4 as uuidv4 } from 'uuid';

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

function hasTemporaryId(converter) {
  // Has temporary ID if no GUID but has hash (or could generate one)
  return !converter.documentGuid && !!(converter.documentHash || converter.fileSource);
}

describe('SuperConverter Document GUID', () => {
  let mockDocx;
  let mockCustomXml;
  let mockSettingsXml;

  beforeEach(() => {
    vi.clearAllMocks();

    // These need to match the actual file structure expected by SuperConverter
    mockCustomXml = {
      name: 'docProps/custom.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
        </Properties>`,
    };

    mockSettingsXml = {
      name: 'word/settings.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        </w:settings>`,
    };

    // Add a minimal document.xml to prevent parsing errors
    const mockDocumentXml = {
      name: 'word/document.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body><w:p><w:r><w:t>Test</w:t></w:r></w:p></w:body>
        </w:document>`,
    };

    mockDocx = [mockCustomXml, mockSettingsXml, mockDocumentXml];
  });

  describe('Document Identifier Resolution', () => {
    it('prioritizes Microsoft docId from settings.xml', () => {
      mockSettingsXml.content = `<?xml version="1.0" encoding="UTF-8"?>
        <w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" 
                    xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">
          <w15:docId w15:val="{MICROSOFT-GUID-123}"/>
        </w:settings>`;

      const converter = new SuperConverter({ docx: mockDocx });
      expect(converter.getDocumentGuid()).toBe('MICROSOFT-GUID-123');
      expect(hasTemporaryId(converter)).toBe(false);
    });

    it('uses custom DocumentGuid when no Microsoft GUID exists', () => {
      // Override just the custom.xml with the GUID
      const customDocx = [...mockDocx];
      customDocx[0] = {
        name: 'docProps/custom.xml',
        content: `<?xml version="1.0" encoding="UTF-8"?>
          <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
            <property name="DocumentGuid" fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2">
              <vt:lpwstr xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">CUSTOM-GUID-456</vt:lpwstr>
            </property>
          </Properties>`,
      };

      const converter = new SuperConverter({ docx: customDocx });
      expect(converter.getDocumentGuid()).toBe('CUSTOM-GUID-456');
      expect(hasTemporaryId(converter)).toBe(false);
    });

    it('generates hash for unmodified document without GUID', async () => {
      const fileSource = Buffer.from('test file content');
      const converter = new SuperConverter({
        docx: mockDocx,
        fileSource,
      });

      // getDocumentIdentifier is now async
      const identifier = await converter.getDocumentIdentifier();
      expect(identifier).toMatch(/^HASH-/);
      expect(hasTemporaryId(converter)).toBe(true);
      expect(converter.getDocumentGuid()).toBeNull();
    });
  });

  describe('GUID Promotion', () => {
    it('promotes hash to GUID when document is modified', async () => {
      const fileSource = Buffer.from('test file content');
      const converter = new SuperConverter({
        docx: mockDocx,
        fileSource,
      });

      // Generate hash first (async)
      await converter.getDocumentIdentifier();

      // Now check if has temporary ID
      expect(hasTemporaryId(converter)).toBe(true);

      // Promote to GUID
      const guid = converter.promoteToGuid();
      expect(guid).toBe('test-uuid-1234');
      expect(converter.getDocumentGuid()).toBe('test-uuid-1234');
      expect(hasTemporaryId(converter)).toBe(false);
      expect(converter.documentModified).toBe(true);
    });

    it('does not re-promote if already has GUID', () => {
      // Override just the custom.xml with the GUID
      const customDocx = [...mockDocx];
      customDocx[0] = {
        name: 'docProps/custom.xml',
        content: `<?xml version="1.0" encoding="UTF-8"?>
          <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
            <property name="DocumentGuid" fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2">
              <vt:lpwstr xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">EXISTING-GUID</vt:lpwstr>
            </property>
          </Properties>`,
      };

      const converter = new SuperConverter({ docx: customDocx });
      const guid = converter.promoteToGuid();
      expect(guid).toBe('EXISTING-GUID');
      expect(uuidv4).not.toHaveBeenCalled();
    });
  });

  describe('Static Methods', () => {
    it('getDocumentGuid checks both sources', () => {
      // Test Microsoft GUID
      const docxWithMsGuid = [
        {
          name: 'word/settings.xml',
          content:
            '<w:settings xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w15:docId w15:val="{MS-GUID}"/></w:settings>',
        },
      ];
      expect(SuperConverter.extractDocumentGuid(docxWithMsGuid)).toBe('MS-GUID');

      // Test when no GUID exists
      const guid = SuperConverter.extractDocumentGuid(mockDocx);
      expect(guid).toBeNull();
    });
  });

  describe('Version Methods', () => {
    it('stores and retrieves version', () => {
      const docx = {
        'docProps/custom.xml': {
          elements: [
            {
              name: 'Properties',
              elements: [],
            },
          ],
        },
      };

      // Set version
      SuperConverter.setStoredSuperdocVersion(docx, '1.2.3');
      const prop = docx['docProps/custom.xml'].elements[0].elements[0];
      expect(prop.elements[0].elements[0].text).toBe('1.2.3');

      // Get version
      const version = SuperConverter.getStoredSuperdocVersion([
        {
          name: 'docProps/custom.xml',
          content: `<?xml version="1.0" encoding="UTF-8"?>
          <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
            <property name="SuperdocVersion" pid="2">
              <vt:lpwstr>1.2.3</vt:lpwstr>
            </property>
          </Properties>`,
        },
      ]);
      expect(version).toBe('1.2.3');
    });
  });

  describe('Custom Properties', () => {
    it('stores a custom property', () => {
      const docx = {
        'docProps/custom.xml': {
          elements: [
            {
              name: 'Properties',
              elements: [],
            },
          ],
        },
      };

      SuperConverter.setStoredCustomProperty(docx, 'MyCustomProp', 'MyValue');
      const prop = docx['docProps/custom.xml'].elements[0].elements[0];
      expect(prop.attributes.name).toBe('MyCustomProp');
      expect(prop.elements[0].elements[0].text).toBe('MyValue');
    });

    it('retrieves a custom property', () => {
      const docx = {
        name: 'docProps/custom.xml',
        content: `<?xml version="1.0" encoding="UTF-8"?>
        <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
          <property name="MyCustomProp" pid="2">
            <vt:lpwstr>MyValue</vt:lpwstr>
          </property>
        </Properties>`,
      };
      const value = SuperConverter.getStoredCustomProperty([docx], 'MyCustomProp');
      expect(value).toBe('MyValue');
    });

    it('returns null if custom property does not exist', () => {
      const value = SuperConverter.getStoredCustomProperty(
        [
          {
            name: 'docProps/custom.xml',
            content: `<?xml version="1.0" encoding="UTF-8"?>
            <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
            </Properties>`,
          },
        ],
        'NonExistentProp',
      );
      expect(value).toBeNull();
    });

    it('returns null when custom.xml is malformed or missing Properties root', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const value = SuperConverter.getStoredCustomProperty(
        [
          {
            name: 'docProps/custom.xml',
            // Simulate a bad payload coming from collaboration sync
            content: `<?xml version="1.0" encoding="UTF-8"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            </Relationships>`,
          },
        ],
        'DocumentGuid',
      );
      expect(value).toBeNull();
      warnSpy.mockRestore();
    });

    describe('Namespace Prefix Support', () => {
      it('retrieves property when Properties element has namespace prefix', () => {
        const docx = {
          name: 'docProps/custom.xml',
          content: `<?xml version="1.0" encoding="UTF-8"?>
          <op:Properties xmlns:op="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
            <property name="MyCustomProp" pid="2">
              <vt:lpwstr>MyValue</vt:lpwstr>
            </property>
          </op:Properties>`,
        };
        const value = SuperConverter.getStoredCustomProperty([docx], 'MyCustomProp');
        expect(value).toBe('MyValue');
      });

      it('retrieves property when property element has namespace prefix', () => {
        const docx = {
          name: 'docProps/custom.xml',
          content: `<?xml version="1.0" encoding="UTF-8"?>
          <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
            <op:property name="MyCustomProp" pid="2">
              <vt:lpwstr>MyValue</vt:lpwstr>
            </op:property>
          </Properties>`,
        };
        const value = SuperConverter.getStoredCustomProperty([docx], 'MyCustomProp');
        expect(value).toBe('MyValue');
      });

      it('retrieves property when both elements have namespace prefixes', () => {
        const docx = {
          name: 'docProps/custom.xml',
          content: `<?xml version="1.0" encoding="UTF-8"?>
          <op:Properties xmlns:op="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
            <op:property name="MyCustomProp" pid="2">
              <vt:lpwstr>MyValue</vt:lpwstr>
            </op:property>
          </op:Properties>`,
        };
        const value = SuperConverter.getStoredCustomProperty([docx], 'MyCustomProp');
        expect(value).toBe('MyValue');
      });

      it('retrieves property with different namespace prefixes', () => {
        const docx = {
          name: 'docProps/custom.xml',
          content: `<?xml version="1.0" encoding="UTF-8"?>
          <custom:Properties xmlns:custom="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
            <custom:property name="TestProp" pid="2">
              <vt:lpwstr>TestValue</vt:lpwstr>
            </custom:property>
          </custom:Properties>`,
        };
        const value = SuperConverter.getStoredCustomProperty([docx], 'TestProp');
        expect(value).toBe('TestValue');
      });

      it('handles mixed prefixed and non-prefixed properties', () => {
        const docx = {
          name: 'docProps/custom.xml',
          content: `<?xml version="1.0" encoding="UTF-8"?>
          <op:Properties xmlns:op="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
            <property name="NormalProp" pid="2">
              <vt:lpwstr>NormalValue</vt:lpwstr>
            </property>
            <op:property name="PrefixedProp" pid="3">
              <vt:lpwstr>PrefixedValue</vt:lpwstr>
            </op:property>
          </op:Properties>`,
        };
        expect(SuperConverter.getStoredCustomProperty([docx], 'NormalProp')).toBe('NormalValue');
        expect(SuperConverter.getStoredCustomProperty([docx], 'PrefixedProp')).toBe('PrefixedValue');
      });

      it('sets property when Properties element has namespace prefix', () => {
        const docx = {
          'docProps/custom.xml': {
            elements: [
              {
                name: 'op:Properties',
                elements: [],
              },
            ],
          },
        };

        SuperConverter.setStoredCustomProperty(docx, 'MyCustomProp', 'MyValue');
        const prop = docx['docProps/custom.xml'].elements[0].elements[0];
        expect(prop.name).toBe('op:property'); // Verify namespace prefix is preserved
        expect(prop.attributes.name).toBe('MyCustomProp');
        expect(prop.elements[0].elements[0].text).toBe('MyValue');
      });

      it('updates existing property with namespace prefix', () => {
        const docx = {
          'docProps/custom.xml': {
            elements: [
              {
                name: 'op:Properties',
                elements: [
                  {
                    name: 'op:property',
                    attributes: {
                      name: 'ExistingProp',
                      pid: 2,
                    },
                    elements: [
                      {
                        type: 'element',
                        name: 'vt:lpwstr',
                        elements: [
                          {
                            type: 'text',
                            text: 'OldValue',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        };

        SuperConverter.setStoredCustomProperty(docx, 'ExistingProp', 'NewValue');
        const prop = docx['docProps/custom.xml'].elements[0].elements[0];
        expect(prop.name).toBe('op:property'); // Verify namespace prefix is preserved
        expect(prop.elements[0].elements[0].text).toBe('NewValue');
      });

      it('normalizes existing property namespace prefix to match parent', () => {
        const docx = {
          'docProps/custom.xml': {
            elements: [
              {
                name: 'op:Properties',
                elements: [
                  {
                    // Existing property without prefix, but parent has prefix
                    name: 'property',
                    attributes: {
                      name: 'MismatchedProp',
                      pid: 2,
                    },
                    elements: [
                      {
                        type: 'element',
                        name: 'vt:lpwstr',
                        elements: [
                          {
                            type: 'text',
                            text: 'OldValue',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        };

        SuperConverter.setStoredCustomProperty(docx, 'MismatchedProp', 'NewValue');
        const prop = docx['docProps/custom.xml'].elements[0].elements[0];
        expect(prop.name).toBe('op:property'); // Verify namespace prefix is normalized to match parent
        expect(prop.elements[0].elements[0].text).toBe('NewValue');
      });

      it('normalizes existing property when parent has no prefix', () => {
        const docx = {
          'docProps/custom.xml': {
            elements: [
              {
                name: 'Properties',
                elements: [
                  {
                    // Existing property with prefix, but parent has no prefix
                    name: 'op:property',
                    attributes: {
                      name: 'MismatchedProp',
                      pid: 2,
                    },
                    elements: [
                      {
                        type: 'element',
                        name: 'vt:lpwstr',
                        elements: [
                          {
                            type: 'text',
                            text: 'OldValue',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        };

        SuperConverter.setStoredCustomProperty(docx, 'MismatchedProp', 'NewValue');
        const prop = docx['docProps/custom.xml'].elements[0].elements[0];
        expect(prop.name).toBe('property'); // Verify namespace prefix is normalized to match parent (no prefix)
        expect(prop.elements[0].elements[0].text).toBe('NewValue');
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('returns null for malformed property structure (missing nested elements)', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const docx = {
          name: 'docProps/custom.xml',
          content: `<?xml version="1.0" encoding="UTF-8"?>
          <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
            <property name="MalformedProp" pid="2">
            </property>
          </Properties>`,
        };
        const value = SuperConverter.getStoredCustomProperty([docx], 'MalformedProp');
        expect(value).toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalledWith('Malformed property structure for "MalformedProp"');

        consoleWarnSpy.mockRestore();
      });

      it('returns null for property with empty text', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const docx = {
          name: 'docProps/custom.xml',
          content: `<?xml version="1.0" encoding="UTF-8"?>
          <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
            <property name="EmptyProp" pid="2">
              <vt:lpwstr></vt:lpwstr>
            </property>
          </Properties>`,
        };
        const value = SuperConverter.getStoredCustomProperty([docx], 'EmptyProp');
        expect(value).toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalledWith('Malformed property structure for "EmptyProp"');

        consoleWarnSpy.mockRestore();
      });

      it('handles malformed property structure in setStoredCustomProperty with preserveExisting', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const docx = {
          'docProps/custom.xml': {
            elements: [
              {
                name: 'Properties',
                elements: [
                  {
                    name: 'property',
                    attributes: {
                      name: 'MalformedProp',
                      pid: 2,
                    },
                    elements: [], // Malformed: missing nested elements
                  },
                ],
              },
            ],
          },
        };

        const value = SuperConverter.setStoredCustomProperty(docx, 'MalformedProp', 'NewValue', true);
        expect(value).toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalledWith('Malformed existing property structure for "MalformedProp"');

        consoleWarnSpy.mockRestore();
      });

      it('recreates property structure when updating malformed property', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const docx = {
          'docProps/custom.xml': {
            elements: [
              {
                name: 'Properties',
                elements: [
                  {
                    name: 'property',
                    attributes: {
                      name: 'MalformedProp',
                      pid: 2,
                    },
                    elements: [], // Malformed: missing nested elements
                  },
                ],
              },
            ],
          },
        };

        const value = SuperConverter.setStoredCustomProperty(docx, 'MalformedProp', 'NewValue');
        expect(value).toBe('NewValue');
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Malformed property structure for "MalformedProp", recreating structure',
        );

        const prop = docx['docProps/custom.xml'].elements[0].elements[0];
        expect(prop.elements[0].elements[0].text).toBe('NewValue');

        consoleWarnSpy.mockRestore();
      });

      it('returns null when Properties element is not found in setStoredCustomProperty', () => {
        const docx = {
          'docProps/custom.xml': {
            elements: [
              {
                name: 'SomeOtherElement',
                elements: [],
              },
            ],
          },
        };

        const value = SuperConverter.setStoredCustomProperty(docx, 'MyProp', 'MyValue');
        expect(value).toBeNull();
      });

      it('handles empty element name gracefully', () => {
        const docx = {
          name: 'docProps/custom.xml',
          content: `<?xml version="1.0" encoding="UTF-8"?>
          <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">
            <property name="ValidProp" pid="2">
              <vt:lpwstr>ValidValue</vt:lpwstr>
            </property>
          </Properties>`,
        };
        // Should still work for valid property
        const value = SuperConverter.getStoredCustomProperty([docx], 'ValidProp');
        expect(value).toBe('ValidValue');
      });

      it('does not match element with empty prefix', () => {
        // Test the _matchesElementName helper directly
        expect(SuperConverter._matchesElementName(':Properties', 'Properties')).toBe(false);
        expect(SuperConverter._matchesElementName(':property', 'property')).toBe(false);
      });
    });

    describe('_matchesElementName Helper', () => {
      it('matches exact name without prefix', () => {
        expect(SuperConverter._matchesElementName('Properties', 'Properties')).toBe(true);
        expect(SuperConverter._matchesElementName('property', 'property')).toBe(true);
      });

      it('matches name with valid namespace prefix', () => {
        expect(SuperConverter._matchesElementName('op:Properties', 'Properties')).toBe(true);
        expect(SuperConverter._matchesElementName('custom:property', 'property')).toBe(true);
        expect(SuperConverter._matchesElementName('ns1:Properties', 'Properties')).toBe(true);
      });

      it('does not match different element names', () => {
        expect(SuperConverter._matchesElementName('SomeOther', 'Properties')).toBe(false);
        expect(SuperConverter._matchesElementName('prop', 'property')).toBe(false);
      });

      it('does not match empty prefix', () => {
        expect(SuperConverter._matchesElementName(':Properties', 'Properties')).toBe(false);
        expect(SuperConverter._matchesElementName(':property', 'property')).toBe(false);
      });

      it('handles null and undefined element names', () => {
        expect(SuperConverter._matchesElementName(null, 'Properties')).toBe(false);
        expect(SuperConverter._matchesElementName(undefined, 'Properties')).toBe(false);
        expect(SuperConverter._matchesElementName('', 'Properties')).toBe(false);
      });

      it('handles non-string element names', () => {
        expect(SuperConverter._matchesElementName(123, 'Properties')).toBe(false);
        expect(SuperConverter._matchesElementName({}, 'Properties')).toBe(false);
        expect(SuperConverter._matchesElementName([], 'Properties')).toBe(false);
      });

      it('handles null and undefined expected names', () => {
        expect(SuperConverter._matchesElementName('Properties', null)).toBe(false);
        expect(SuperConverter._matchesElementName('Properties', undefined)).toBe(false);
        expect(SuperConverter._matchesElementName('Properties', '')).toBe(false);
      });

      it('matches case-sensitive names', () => {
        expect(SuperConverter._matchesElementName('properties', 'Properties')).toBe(false);
        expect(SuperConverter._matchesElementName('PROPERTY', 'property')).toBe(false);
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('deprecated methods show warnings', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      SuperConverter.updateDocumentVersion(mockDocx, '1.0.0');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'updateDocumentVersion is deprecated, use setStoredSuperdocVersion instead',
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Fonts', () => {
    const mockFontTableWithFonts = {
      name: 'word/fontTable.xml',
      content: `
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:fonts xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
          xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
          xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
          xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex"
          xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"
          xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml"
          xmlns:w16du="http://schemas.microsoft.com/office/word/2023/wordml/word16du"
          xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash"
          xmlns:w16sdtfl="http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock"
          xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" mc:Ignorable="w14 w15 w16se w16cid w16 w16cex w16sdtdh w16sdtfl w16du">
          <w:font w:name="Aptos">
              <w:panose1 w:val="020B0004020202020204"/>
              <w:charset w:val="00"/>
              <w:family w:val="swiss"/>
              <w:pitch w:val="variable"/>
              <w:sig w:usb0="20000287" w:usb1="00000003" w:usb2="00000000" w:usb3="00000000" w:csb0="0000019F" w:csb1="00000000"/>
          </w:font>
          <w:font w:name="Times New Roman">
              <w:panose1 w:val="02020603050405020304"/>
              <w:charset w:val="01"/>
              <w:family w:val="roman"/>
              <w:pitch w:val="variable"/>
              <w:sig w:usb0="E0002EFF" w:usb1="C000785B" w:usb2="00000009" w:usb3="00000000" w:csb0="000001FF" w:csb1="00000000"/>
          </w:font>
          <w:font w:name="Aptos Display">
              <w:panose1 w:val="020B0004020202020204"/>
              <w:charset w:val="00"/>
              <w:family w:val="swiss"/>
              <w:pitch w:val="variable"/>
              <w:sig w:usb0="20000287" w:usb1="00000003" w:usb2="00000000" w:usb3="00000000" w:csb0="0000019F" w:csb1="00000000"/>
          </w:font>
        </w:fonts>`,
    };

    const mockFontTableWithoutWFonts = {
      name: 'word/fontTable.xml',
      content: `
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    };

    const mockFontTableWithoutWFont = {
      name: 'word/fontTable.xml',
      content: `
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:fonts xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
          xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
          xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
          xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex"
          xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"
          xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml"
          xmlns:w16du="http://schemas.microsoft.com/office/word/2023/wordml/word16du"
          xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash"
          xmlns:w16sdtfl="http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock"
          xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" mc:Ignorable="w14 w15 w16se w16cid w16 w16cex w16sdtdh w16sdtfl w16du">
        </w:fonts>`,
    };

    describe('getDocumentFonts', () => {
      it('should return fonts used in the document', () => {
        const converter = new SuperConverter({ docx: [...mockDocx, mockFontTableWithFonts] });
        const fonts = converter.getDocumentFonts();
        const expected = ['Aptos', 'Aptos Display', 'Times New Roman'];

        expect(fonts.sort()).toEqual(expected.sort());
      });

      it('should return empty fonts if fontTable is not available', () => {
        const converter = new SuperConverter({ docx: mockDocx });
        const fonts = converter.getDocumentFonts();

        expect(fonts).toEqual([]);
      });

      it('should return empty fonts if w:fonts is not present', () => {
        const converter = new SuperConverter({ docx: [...mockDocx, mockFontTableWithoutWFonts] });
        const fonts = converter.getDocumentFonts();

        expect(fonts).toEqual([]);
      });

      it('should return empty fonts if no w:font at all', () => {
        const converter = new SuperConverter({ docx: [...mockDocx, mockFontTableWithoutWFont] });
        const fonts = converter.getDocumentFonts();

        expect(fonts).toEqual([]);
      });

      it('should return inline document fonts if fontTable is not available', () => {
        const converter = new SuperConverter({ docx: mockDocx });
        converter.inlineDocumentFonts = ['SomeFont', 'SomeFont2'];
        const fonts = converter.getDocumentFonts();

        expect(fonts).toEqual(['SomeFont', 'SomeFont2']);
      });

      it('should not return duplicate fonts', () => {
        const converter = new SuperConverter({ docx: [...mockDocx, mockFontTableWithFonts] });
        // Include some fonts that are already on the fontTable
        converter.inlineDocumentFonts = ['Aptos', 'Times New Roman'];
        const fonts = converter.getDocumentFonts();
        const expected = ['Aptos', 'Aptos Display', 'Times New Roman'];

        expect(fonts.sort()).toEqual(expected.sort());
      });

      it('should not return duplicate fonts (inline fonts)', () => {
        const converter = new SuperConverter({ docx: mockDocx });
        converter.inlineDocumentFonts = ['SomeFont', 'SomeFont', 'SomeFont'];
        const fonts = converter.getDocumentFonts();
        const expected = ['SomeFont'];
        expect(fonts.sort()).toEqual(expected.sort());
      });
    });
  });
});

describe('XML whitespace preservation', () => {
  it('preserves whitespace-only w:t runs without xml:space attribute', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xml:space="preserve">
        <w:body>
          <w:p><w:r><w:t> </w:t></w:r><w:r><w:t>Word</w:t></w:r></w:p>
        </w:body>
      </w:document>`;
    const converter = new SuperConverter({ docx: [{ name: 'word/document.xml', content: xml }] });
    const doc = converter.convertedXml['word/document.xml'];

    // Find all w:t nodes
    const textNodes = [];
    const collectTextNodes = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.name === 'w:t') textNodes.push(node);
      if (Array.isArray(node.elements)) node.elements.forEach(collectTextNodes);
    };
    collectTextNodes(doc.elements?.[0]);

    // The whitespace-only node should have [[sdspace]] placeholders
    const placeholderNode = textNodes.find((node) => node.elements?.[0]?.text?.includes('[[sdspace]]'));
    expect(placeholderNode).toBeTruthy();
  });

  it('preserves whitespace-only w:delText runs', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:del><w:r><w:delText> </w:delText></w:r></w:del></w:p>
        </w:body>
      </w:document>`;
    const converter = new SuperConverter({ docx: [{ name: 'word/document.xml', content: xml }] });
    const doc = converter.convertedXml['word/document.xml'];

    // Find all w:delText nodes
    const textNodes = [];
    const collectTextNodes = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.name === 'w:delText') textNodes.push(node);
      if (Array.isArray(node.elements)) node.elements.forEach(collectTextNodes);
    };
    collectTextNodes(doc.elements?.[0]);

    // The whitespace-only node should have [[sdspace]] placeholders
    const placeholderNode = textNodes.find((node) => node.elements?.[0]?.text?.includes('[[sdspace]]'));
    expect(placeholderNode).toBeTruthy();
  });

  it('captures document-level xml:space attribute', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xml:space="preserve">
        <w:body><w:p><w:r><w:t>Test</w:t></w:r></w:p></w:body>
      </w:document>`;
    const converter = new SuperConverter({ docx: [{ name: 'word/document.xml', content: xml }] });

    expect(converter.documentAttributes?.['xml:space']).toBe('preserve');
  });

  it('does not corrupt literal [[sdspace]] in document content', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>This text contains [[sdspace]] literal placeholder</w:t></w:r></w:p>
        </w:body>
      </w:document>`;
    const converter = new SuperConverter({ docx: [{ name: 'word/document.xml', content: xml }] });
    const doc = converter.convertedXml['word/document.xml'];

    // Find the text node
    const textNodes = [];
    const collectTextNodes = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.name === 'w:t') textNodes.push(node);
      if (Array.isArray(node.elements)) node.elements.forEach(collectTextNodes);
    };
    collectTextNodes(doc.elements?.[0]);

    // The literal [[sdspace]] should still be present in the parsed JSON
    // (it will be removed during text node processing in t-translator)
    const textNode = textNodes[0];
    expect(textNode.elements[0].text).toBe('This text contains [[sdspace]] literal placeholder');
  });

  it('handles w:t elements with attributes correctly', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
        </w:body>
      </w:document>`;
    const converter = new SuperConverter({ docx: [{ name: 'word/document.xml', content: xml }] });
    const doc = converter.convertedXml['word/document.xml'];

    // Find the text node with attributes
    const textNodes = [];
    const collectTextNodes = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.name === 'w:t') textNodes.push(node);
      if (Array.isArray(node.elements)) node.elements.forEach(collectTextNodes);
    };
    collectTextNodes(doc.elements?.[0]);

    const textNode = textNodes[0];
    expect(textNode.attributes?.['xml:space']).toBe('preserve');
    expect(textNode.elements[0].text).toContain('[[sdspace]]');
  });

  it('handles multiple w:t elements with mixed attributes', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:r><w:t>Normal text</w:t></w:r>
            <w:r><w:t xml:space="preserve"> </w:t></w:r>
            <w:r><w:t xml:space="default">Trimmed text  </w:t></w:r>
          </w:p>
        </w:body>
      </w:document>`;
    const converter = new SuperConverter({ docx: [{ name: 'word/document.xml', content: xml }] });
    const doc = converter.convertedXml['word/document.xml'];

    // Find all text nodes
    const textNodes = [];
    const collectTextNodes = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.name === 'w:t') textNodes.push(node);
      if (Array.isArray(node.elements)) node.elements.forEach(collectTextNodes);
    };
    collectTextNodes(doc.elements?.[0]);

    expect(textNodes.length).toBe(3);
    expect(textNodes[0].elements[0].text).toBe('Normal text');
    expect(textNodes[1].attributes?.['xml:space']).toBe('preserve');
    expect(textNodes[1].elements[0].text).toContain('[[sdspace]]');
    expect(textNodes[2].attributes?.['xml:space']).toBe('default');
    expect(textNodes[2].elements[0].text).toBe('Trimmed text  ');
  });
});

describe('SuperConverter styles fallback', () => {
  const baseDocumentXml = {
    name: 'word/document.xml',
    content: `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body><w:p><w:r><w:t>Test</w:t></w:r></w:p></w:body>
      </w:document>`,
  };

  const buildStylesXml = (styleId) => ({
    name: 'word/styles2.xml',
    content: `<?xml version="1.0" encoding="UTF-8"?>
      <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:style w:type="paragraph" w:styleId="${styleId}">
          <w:name w:val="${styleId}"/>
        </w:style>
      </w:styles>`,
  });

  it('uses styles2.xml when styles.xml is missing', () => {
    const styles2Xml = buildStylesXml('AltStyle2');
    const converter = new SuperConverter({ docx: [baseDocumentXml, styles2Xml] });
    const styles = converter.convertedXml['word/styles.xml'];

    expect(styles).toBeTruthy();
    expect(styles.elements?.[0]?.name).toBe('w:styles');
    expect(styles.elements?.[0]?.elements?.[0]?.attributes?.['w:styleId']).toBe('AltStyle2');
  });

  it('prefers the lowest-indexed styles file when multiple exist', () => {
    const styles2Xml = buildStylesXml('AltStyle2');
    const styles4Xml = {
      name: 'word/styles4.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
        <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:style w:type="paragraph" w:styleId="AltStyle4">
            <w:name w:val="AltStyle4"/>
          </w:style>
        </w:styles>`,
    };

    const converter = new SuperConverter({ docx: [baseDocumentXml, styles4Xml, styles2Xml] });
    const styles = converter.convertedXml['word/styles.xml'];

    expect(styles?.elements?.[0]?.elements?.[0]?.attributes?.['w:styleId']).toBe('AltStyle2');
  });
});
