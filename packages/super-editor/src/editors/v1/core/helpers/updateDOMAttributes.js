const defaultBooleans = ['required', 'readonly', 'disabled', 'checked', 'multiple', 'autofocus'];

export function updateDOMAttributes(dom, attrs = {}, options = {}) {
  const customBooleans = options.customBooleans || [];
  const booleans = [...defaultBooleans, ...customBooleans];

  Object.entries(attrs).forEach(([key, value]) => {
    if (booleans.includes(key)) {
      if (!value) dom.removeAttribute(key);
      else dom.setAttribute(key, '');
      return;
    }

    if (value != null) {
      dom.setAttribute(key, value);
    } else {
      dom.removeAttribute(key);
    }
  });
}
