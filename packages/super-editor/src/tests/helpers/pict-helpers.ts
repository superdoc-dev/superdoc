export const createPict = (elements = []) => ({
  name: 'v:pict',
  elements,
});

export const createRect = () => ({
  name: 'v:rect',
});

export const createShape = (elements = []) => ({
  name: 'v:shape',
  elements,
});

export const createGroup = () => ({
  name: 'v:group',
});

export const createTextbox = () => ({
  name: 'v:textbox',
});
