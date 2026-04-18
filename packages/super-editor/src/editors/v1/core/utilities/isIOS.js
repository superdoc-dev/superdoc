export const isIOS = () => {
  if (typeof navigator === 'undefined') return false;
  return ['iPad Simulator', 'iPhone Simulator', 'iPod Simulator', 'iPad', 'iPhone', 'iPod'].includes(
    navigator.platform,
  );
};
