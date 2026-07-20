const devCerts = require('office-addin-dev-certs');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

async function getHttpsOptions() {
  const options = await devCerts.getHttpsServerOptions();
  return { ca: options.ca, key: options.key, cert: options.cert };
}

module.exports = async (env = {}) => ({
  devtool: 'source-map',
  entry: { taskpane: './src/taskpane/taskpane.js' },
  output: { clean: true },
  module: {
    rules: [
      { test: /\.html$/, use: 'html-loader' },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({ template: './src/taskpane/taskpane.html', filename: 'taskpane.html' }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'assets', to: 'assets' },
        { from: 'manifest.xml', to: 'manifest.xml' },
      ],
    }),
  ],
  devServer: {
    headers: { 'Access-Control-Allow-Origin': '*' },
    server: {
      type: 'https',
      ...(env.WEBPACK_BUILD ? {} : { options: await getHttpsOptions() }),
    },
    port: 3015,
  },
});
