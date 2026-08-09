export default {
  plugins: [
    (await import('postcss-nested')).default,
  ]
}
