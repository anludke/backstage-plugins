import { DynamicRemotePlugin } from '@openshift/dynamic-plugin-sdk-webpack';
import ESLintPlugin from 'eslint-webpack-plugin';
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import webpack, { ProvidePlugin } from 'webpack';

import { join as joinPath, resolve as resolvePath } from 'path';

import { BundlingPaths } from './paths';
import { transforms } from './transforms';
import { DynamicPluginOptions } from './types';

/**
 * TODO: Create a config API to configure and optimize dependency sharing
 * https://medium.com/@marvusm.mmi/webpack-module-federation-think-twice-before-sharing-a-dependency-18b3b0e352cb
 */
export const sharedModules = {
  /**
   * Mandatory singleton packages for sharing
   */
  react: {
    singleton: true,
    requiredVersion: '*',
  },
  'react-dom': {
    singleton: true,
    requiredVersion: '*',
  },
  'react-router-dom': {
    singleton: true,
    requiredVersion: '*',
  },
  'react-router': {
    singleton: true,
    requiredVersion: '*',
  },
  '@backstage/version-bridge': {
    singleton: true,
    requiredVersion: '*',
  },
  '@backstage/core-app-api': {
    singleton: true,
    requiredVersion: '*',
  },
  '@backstage/core-plugin-api': {
    singleton: true,
    requiredVersion: '*',
  },
  '@backstage/frontend-plugin-api': {
    singleton: true,
    requiredVersion: '*',
  },
  '@scalprum/react-core': {
    singleton: true,
    requiredVersion: '*',
  },
  '@openshift/dynamic-plugin-sdk': {
    singleton: true,
    requiredVersion: '*',
  },
  /**
   * The following two packages are required to be shared as singletons to enable UI theming
   */
  '@material-ui/core/styles': {
    singleton: true,
    requiredVersion: '*',
  },
  '@material-ui/styles': {
    singleton: true,
    requiredVersion: '*',
  },
};

export async function createScalprumConfig(
  paths: BundlingPaths,
  options: DynamicPluginOptions,
): Promise<webpack.Configuration> {
  const { checksEnabled, isDev } = options;

  const { plugins, loaders } = transforms({
    ...options,
    isDev: !!options.isDev,
  });

  if (checksEnabled) {
    plugins.push(
      new ForkTsCheckerWebpackPlugin({
        typescript: { configFile: paths.targetTsConfig, memoryLimit: 4096 },
      }),
      new ESLintPlugin({
        context: paths.targetPath,
        files: ['**/*.(ts|tsx|mts|cts|js|jsx|mjs|cjs)'],
      }),
    );
  }

  // TODO(blam): process is no longer auto polyfilled by webpack in v5.
  // we use the provide plugin to provide this polyfill, but lets look
  // to remove this eventually!
  plugins.push(
    new ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  );

  plugins.push(
    new webpack.EnvironmentPlugin({
      HAS_REACT_DOM_CLIENT: false,
      APP_CONFIG: options.frontendAppConfigs,
    }),
  );

  const dynamicPluginPlugin = new DynamicRemotePlugin({
    extensions: [],
    sharedModules,
    entryScriptFilename: `${options.pluginMetadata.name}.[fullhash].js`,
    pluginMetadata: {
      ...options.pluginMetadata,
    },
  });
  plugins.push(dynamicPluginPlugin);

  return {
    mode: isDev ? 'development' : 'production',
    profile: false,
    bail: false,
    performance: {
      hints: false, // we check the gzip size instead
    },
    devtool: isDev ? 'eval-cheap-module-source-map' : 'source-map',
    context: paths.targetPath,
    entry: {}, // Plugin container entry is generated by DynamicRemotePlugin
    resolve: {
      alias: {
        '@backstage/frontend-app-api/src': joinPath(
          process.cwd(),
          'src',
          'overrides',
          '@backstage',
          'frontend-app-api',
          'src',
        ),
      },
      extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json', '.wasm'],
    },
    module: {
      rules: loaders,
    },
    output: {
      path: paths.targetScalprumDist,
      publicPath: 'auto',
      filename: isDev ? '[name].js' : 'static/[name].[fullhash:8].js',
      chunkFilename: isDev
        ? '[name].chunk.js'
        : 'static/[name].[chunkhash:8].chunk.js',
      ...(isDev
        ? {
            devtoolModuleFilenameTemplate: (info: any) =>
              `file:///${resolvePath(info.absoluteResourcePath).replace(
                /\\/g,
                '/',
              )}`,
          }
        : {}),
    },
    plugins,
  };
}
