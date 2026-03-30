/**
 *
 * @returns {NodeListHandler}
 */
export const createNodeListHandlerMock = () => {
  return {
    handlerEntities: [
      {
        handlerName: 'textNodeHandler',
        handler: () => ({
          nodes: [
            {
              type: 'textNodeHandler',
              content: {},
              attrs: {},
              marks: [],
            },
          ],
          consumed: 1,
        }),
      },
    ],
    handler: () => [{ type: 'dummyNode', content: {}, attrs: {} }],
  };
};
