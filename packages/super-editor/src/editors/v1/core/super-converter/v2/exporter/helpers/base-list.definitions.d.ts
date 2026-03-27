export namespace baseOrderedListDef {
  let type: string;
  let name: string;
  let attributes: {
    'w:abstractNumId': string;
    'w15:restartNumberingAfterBreak': string;
  };
  let elements: (
    | {
        type: string;
        name: string;
        attributes: {
          'w:val': string;
          'w:ilvl'?: undefined;
          'w:tplc'?: undefined;
          'w:tentative'?: undefined;
        };
        elements?: undefined;
      }
    | {
        type: string;
        name: string;
        attributes: {
          'w:ilvl': string;
          'w:tplc': string;
          'w:val'?: undefined;
          'w:tentative'?: undefined;
        };
        elements: (
          | {
              type: string;
              name: string;
              attributes: {
                'w:val': string;
              };
              elements?: undefined;
            }
          | {
              type: string;
              name: string;
              elements: {
                type: string;
                name: string;
                attributes: {
                  'w:left': string;
                  'w:hanging': string;
                };
              }[];
              attributes?: undefined;
            }
        )[];
      }
    | {
        type: string;
        name: string;
        attributes: {
          'w:ilvl': string;
          'w:tplc': string;
          'w:tentative': string;
          'w:val'?: undefined;
        };
        elements: (
          | {
              type: string;
              name: string;
              attributes: {
                'w:val': string;
              };
              elements?: undefined;
            }
          | {
              type: string;
              name: string;
              elements: {
                type: string;
                name: string;
                attributes: {
                  'w:left': string;
                  'w:hanging': string;
                };
              }[];
              attributes?: undefined;
            }
        )[];
      }
  )[];
}
export namespace baseBulletList {
  let type_1: string;
  export { type_1 as type };
  let name_1: string;
  export { name_1 as name };
  let attributes_1: {
    'w:abstractNumId': string;
    'w15:restartNumberingAfterBreak': string;
  };
  export { attributes_1 as attributes };
  let elements_1: (
    | {
        type: string;
        name: string;
        attributes: {
          'w:val': string;
          'w:ilvl'?: undefined;
          'w:tplc'?: undefined;
          'w:tentative'?: undefined;
        };
        elements?: undefined;
      }
    | {
        type: string;
        name: string;
        attributes: {
          'w:ilvl': string;
          'w:tplc': string;
          'w:val'?: undefined;
          'w:tentative'?: undefined;
        };
        elements: (
          | {
              type: string;
              name: string;
              attributes: {
                'w:val': string;
              };
              elements?: undefined;
            }
          | {
              type: string;
              name: string;
              elements: {
                type: string;
                name: string;
                attributes: {
                  'w:left': string;
                  'w:hanging': string;
                };
              }[];
              attributes?: undefined;
            }
          | {
              type: string;
              name: string;
              elements: {
                type: string;
                name: string;
                attributes: {
                  'w:ascii': string;
                  'w:hAnsi': string;
                  'w:hint': string;
                };
              }[];
              attributes?: undefined;
            }
        )[];
      }
    | {
        type: string;
        name: string;
        attributes: {
          'w:ilvl': string;
          'w:tplc': string;
          'w:tentative': string;
          'w:val'?: undefined;
        };
        elements: (
          | {
              type: string;
              name: string;
              attributes: {
                'w:val': string;
              };
              elements?: undefined;
            }
          | {
              type: string;
              name: string;
              elements: {
                type: string;
                name: string;
                attributes: {
                  'w:left': string;
                  'w:hanging': string;
                };
              }[];
              attributes?: undefined;
            }
          | {
              type: string;
              name: string;
              elements: {
                type: string;
                name: string;
                attributes: {
                  'w:ascii': string;
                  'w:hAnsi': string;
                  'w:cs': string;
                  'w:hint': string;
                };
              }[];
              attributes?: undefined;
            }
        )[];
      }
    | {
        type: string;
        name: string;
        attributes: {
          'w:ilvl': string;
          'w:tplc': string;
          'w:tentative': string;
          'w:val'?: undefined;
        };
        elements: (
          | {
              type: string;
              name: string;
              attributes: {
                'w:val': string;
              };
              elements?: undefined;
            }
          | {
              type: string;
              name: string;
              elements: {
                type: string;
                name: string;
                attributes: {
                  'w:left': string;
                  'w:hanging': string;
                };
              }[];
              attributes?: undefined;
            }
          | {
              type: string;
              name: string;
              elements: {
                type: string;
                name: string;
                attributes: {
                  'w:ascii': string;
                  'w:hAnsi': string;
                  'w:hint': string;
                };
              }[];
              attributes?: undefined;
            }
        )[];
      }
  )[];
  export { elements_1 as elements };
}
export namespace baseNumbering {
  export namespace declaration {
    export namespace attributes_2 {
      let version: string;
      let encoding: string;
      let standalone: string;
    }
    export { attributes_2 as attributes };
  }
  let elements_2: {
    type: string;
    name: string;
    attributes: {
      'xmlns:wpc': string;
      'xmlns:cx': string;
      'xmlns:cx1': string;
      'xmlns:cx2': string;
      'xmlns:cx3': string;
      'xmlns:cx4': string;
      'xmlns:cx5': string;
      'xmlns:cx6': string;
      'xmlns:cx7': string;
      'xmlns:cx8': string;
      'xmlns:mc': string;
      'xmlns:aink': string;
      'xmlns:am3d': string;
      'xmlns:o': string;
      'xmlns:oel': string;
      'xmlns:r': string;
      'xmlns:m': string;
      'xmlns:v': string;
      'xmlns:wp14': string;
      'xmlns:wp': string;
      'xmlns:w10': string;
      'xmlns:w': string;
      'xmlns:w14': string;
      'xmlns:w15': string;
      'xmlns:w16cex': string;
      'xmlns:w16cid': string;
      'xmlns:w16': string;
      'xmlns:w16du': string;
      'xmlns:w16sdtdh': string;
      'xmlns:w16se': string;
      'xmlns:wpg': string;
      'xmlns:wpi': string;
      'xmlns:wne': string;
      'xmlns:wps': string;
      'mc:Ignorable': string;
    };
    elements: (
      | {
          type: string;
          name: string;
          attributes: {
            'w:abstractNumId': string;
            'w15:restartNumberingAfterBreak': string;
            'w:numId'?: undefined;
            'w16cid:durableId'?: undefined;
          };
          elements: (
            | {
                type: string;
                name: string;
                attributes: {
                  'w:val': string;
                  'w:ilvl'?: undefined;
                  'w:tplc'?: undefined;
                  'w:tentative'?: undefined;
                };
                elements?: undefined;
              }
            | {
                type: string;
                name: string;
                attributes: {
                  'w:ilvl': string;
                  'w:tplc': string;
                  'w:val'?: undefined;
                  'w:tentative'?: undefined;
                };
                elements: (
                  | {
                      type: string;
                      name: string;
                      attributes: {
                        'w:val': string;
                      };
                      elements?: undefined;
                    }
                  | {
                      type: string;
                      name: string;
                      elements: {
                        type: string;
                        name: string;
                        attributes: {
                          'w:left': string;
                          'w:hanging': string;
                        };
                      }[];
                      attributes?: undefined;
                    }
                  | {
                      type: string;
                      name: string;
                      elements: {
                        type: string;
                        name: string;
                        attributes: {
                          'w:ascii': string;
                          'w:hAnsi': string;
                          'w:hint': string;
                        };
                      }[];
                      attributes?: undefined;
                    }
                )[];
              }
            | {
                type: string;
                name: string;
                attributes: {
                  'w:ilvl': string;
                  'w:tplc': string;
                  'w:tentative': string;
                  'w:val'?: undefined;
                };
                elements: (
                  | {
                      type: string;
                      name: string;
                      attributes: {
                        'w:val': string;
                      };
                      elements?: undefined;
                    }
                  | {
                      type: string;
                      name: string;
                      elements: {
                        type: string;
                        name: string;
                        attributes: {
                          'w:left': string;
                          'w:hanging': string;
                        };
                      }[];
                      attributes?: undefined;
                    }
                  | {
                      type: string;
                      name: string;
                      elements: {
                        type: string;
                        name: string;
                        attributes: {
                          'w:ascii': string;
                          'w:hAnsi': string;
                          'w:cs': string;
                          'w:hint': string;
                        };
                      }[];
                      attributes?: undefined;
                    }
                )[];
              }
            | {
                type: string;
                name: string;
                attributes: {
                  'w:ilvl': string;
                  'w:tplc': string;
                  'w:tentative': string;
                  'w:val'?: undefined;
                };
                elements: (
                  | {
                      type: string;
                      name: string;
                      attributes: {
                        'w:val': string;
                      };
                      elements?: undefined;
                    }
                  | {
                      type: string;
                      name: string;
                      elements: {
                        type: string;
                        name: string;
                        attributes: {
                          'w:left': string;
                          'w:hanging': string;
                        };
                      }[];
                      attributes?: undefined;
                    }
                  | {
                      type: string;
                      name: string;
                      elements: {
                        type: string;
                        name: string;
                        attributes: {
                          'w:ascii': string;
                          'w:hAnsi': string;
                          'w:hint': string;
                        };
                      }[];
                      attributes?: undefined;
                    }
                )[];
              }
          )[];
        }
      | {
          type: string;
          name: string;
          attributes: {
            'w:numId': string;
            'w16cid:durableId': string;
            'w:abstractNumId'?: undefined;
            'w15:restartNumberingAfterBreak'?: undefined;
          };
          elements: {
            type: string;
            name: string;
            attributes: {
              'w:val': string;
            };
          }[];
        }
    )[];
  }[];
  export { elements_2 as elements };
}
//# sourceMappingURL=base-list.definitions.d.ts.map
