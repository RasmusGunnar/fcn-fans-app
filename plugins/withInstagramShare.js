const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');
const plist = require('@expo/plist').default;
const fs = require('fs');
const path = require('path');

const TARGET_NAME = 'FCNFansShareExtension';
const PRODUCTION_EXTENSION_BUNDLE_ID = 'dk.rasmusgunnar.fcnfans.share';
const PRODUCTION_APP_GROUP_ID = 'group.dk.rasmusgunnar.fcnfans.share';
const DEPLOYMENT_TARGET = '15.1';
const SOURCE_FILE = 'ShareViewController.swift';

function getShareIdentifiers(config) {
  const isDemo = config.ios?.bundleIdentifier?.endsWith('.demo') === true;
  return {
    extensionBundleId: isDemo
      ? 'dk.rasmusgunnar.fcnfans.demo.share'
      : PRODUCTION_EXTENSION_BUNDLE_ID,
    appGroupId: isDemo ? 'group.dk.rasmusgunnar.fcnfans.demo.share' : PRODUCTION_APP_GROUP_ID,
    scheme: isDemo ? 'fcnfans-demo' : 'fcnfans',
    displayName: isDemo ? 'FCN Fans Demo' : 'FCN Fans',
  };
}

function addUnique(values, value) {
  const result = Array.isArray(values) ? [...values] : [];
  if (!result.includes(value)) result.push(value);
  return result;
}

function withShareConfig(config) {
  const { appGroupId, extensionBundleId } = getShareIdentifiers(config);
  config.ios = config.ios || {};
  config.ios.entitlements = config.ios.entitlements || {};
  config.ios.entitlements['com.apple.security.application-groups'] = addUnique(
    config.ios.entitlements['com.apple.security.application-groups'],
    appGroupId,
  );

  const eas = config.extra?.eas || {};
  const build = eas.build || {};
  const experimental = build.experimental || {};
  const ios = experimental.ios || {};
  const appExtensions = [...(ios.appExtensions || [])];
  const extension = {
    targetName: TARGET_NAME,
    bundleIdentifier: extensionBundleId,
    entitlements: { 'com.apple.security.application-groups': [appGroupId] },
  };
  const existingIndex = appExtensions.findIndex((item) => item.targetName === TARGET_NAME);
  if (existingIndex >= 0) appExtensions[existingIndex] = extension;
  else appExtensions.push(extension);
  config.extra = {
    ...(config.extra || {}),
    eas: {
      ...eas,
      build: {
        ...build,
        experimental: { ...experimental, ios: { ...ios, appExtensions } },
      },
    },
  };
  return config;
}

function withMainAppGroup(config) {
  const { appGroupId } = getShareIdentifiers(config);
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.security.application-groups'] = addUnique(
      mod.modResults['com.apple.security.application-groups'],
      appGroupId,
    );
    return mod;
  });
  return withInfoPlist(config, (mod) => {
    mod.modResults.FCNIncomingShareAppGroupId = appGroupId;
    return mod;
  });
}

function withShareIntent(config) {
  return withAndroidManifest(config, (mod) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    mainActivity['intent-filter'] = mainActivity['intent-filter'] || [];
    const exists = mainActivity['intent-filter'].some(
      (filter) =>
        (filter.action || []).some(
          (action) => action.$?.['android:name'] === 'android.intent.action.SEND',
        ) && (filter.data || []).some((data) => data.$?.['android:mimeType'] === 'text/plain'),
    );
    if (!exists) {
      mainActivity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      });
    }
    return mod;
  });
}

function withShareExtensionFiles(config) {
  const { appGroupId, displayName, scheme } = getShareIdentifiers(config);
  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const targetDir = path.join(mod.modRequest.platformProjectRoot, TARGET_NAME);
      fs.mkdirSync(targetDir, { recursive: true });
      const source = fs
        .readFileSync(
          path.join(mod.modRequest.projectRoot, 'plugins', 'instagram-share', SOURCE_FILE),
          'utf8',
        )
        .replaceAll(PRODUCTION_APP_GROUP_ID, appGroupId)
        .replaceAll('fcnfans://', `${scheme}://`);
      fs.writeFileSync(path.join(targetDir, SOURCE_FILE), source);
      fs.writeFileSync(
        path.join(targetDir, 'Info.plist'),
        plist.build({
          CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
          CFBundleDisplayName: displayName,
          CFBundleExecutable: '$(EXECUTABLE_NAME)',
          CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
          CFBundleInfoDictionaryVersion: '6.0',
          CFBundleName: '$(PRODUCT_NAME)',
          CFBundlePackageType: 'XPC!',
          CFBundleShortVersionString: '$(MARKETING_VERSION)',
          CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
          NSExtension: {
            NSExtensionAttributes: {
              NSExtensionActivationRule: {
                NSExtensionActivationSupportsText: true,
                NSExtensionActivationSupportsWebURLWithMaxCount: 1,
                NSExtensionActivationSupportsWebPageWithMaxCount: 1,
              },
            },
            NSExtensionPointIdentifier: 'com.apple.share-services',
            NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).ShareViewController',
          },
        }),
      );
      fs.writeFileSync(
        path.join(targetDir, `${TARGET_NAME}.entitlements`),
        plist.build({ 'com.apple.security.application-groups': [appGroupId] }),
      );
      return mod;
    },
  ]);
}

function addXCConfigurationList(project, version, buildNumber, extensionBundleId) {
  const common = {
    CODE_SIGN_ENTITLEMENTS: `"${TARGET_NAME}/${TARGET_NAME}.entitlements"`,
    CODE_SIGN_STYLE: 'Automatic',
    CURRENT_PROJECT_VERSION: `"${buildNumber}"`,
    GENERATE_INFOPLIST_FILE: 'NO',
    INFOPLIST_FILE: `"${TARGET_NAME}/Info.plist"`,
    IPHONEOS_DEPLOYMENT_TARGET: `"${DEPLOYMENT_TARGET}"`,
    LD_RUNPATH_SEARCH_PATHS: [
      '"$(inherited)"',
      '"@executable_path/Frameworks"',
      '"@executable_path/../../Frameworks"',
    ],
    MARKETING_VERSION: version,
    PRODUCT_BUNDLE_IDENTIFIER: `"${extensionBundleId}"`,
    PRODUCT_NAME: '"$(TARGET_NAME)"',
    SKIP_INSTALL: 'YES',
    SWIFT_EMIT_LOC_STRINGS: 'YES',
    SWIFT_VERSION: '5.0',
    TARGETED_DEVICE_FAMILY: '"1,2"',
  };
  return project.addXCConfigurationList(
    [
      {
        name: 'Debug',
        isa: 'XCBuildConfiguration',
        buildSettings: {
          ...common,
          DEBUG_INFORMATION_FORMAT: 'dwarf',
          SWIFT_ACTIVE_COMPILATION_CONDITIONS: '"DEBUG $(inherited)"',
          SWIFT_OPTIMIZATION_LEVEL: '"-Onone"',
        },
      },
      {
        name: 'Release',
        isa: 'XCBuildConfiguration',
        buildSettings: {
          ...common,
          COPY_PHASE_STRIP: 'NO',
          DEBUG_INFORMATION_FORMAT: '"dwarf-with-dsym"',
          SWIFT_COMPILATION_MODE: 'wholemodule',
        },
      },
    ],
    'Release',
    `Build configuration list for PBXNativeTarget "${TARGET_NAME}"`,
  );
}

function withShareExtensionTarget(config) {
  const { extensionBundleId } = getShareIdentifiers(config);
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const nativeTargets = project.pbxNativeTargetSection();
    const existing = Object.values(nativeTargets).some(
      (target) =>
        target &&
        typeof target === 'object' &&
        String(target.name || '').replaceAll('"', '') === TARGET_NAME,
    );
    if (existing) return mod;

    const groupName = 'Embed Foundation Extensions';
    const targetUuid = project.generateUuid();
    const configurationList = addXCConfigurationList(
      project,
      mod.version || '1.0',
      mod.ios?.buildNumber || '1',
      extensionBundleId,
    );
    const productFile = project.addProductFile(TARGET_NAME, {
      basename: `${TARGET_NAME}.appex`,
      group: groupName,
      explicitFileType: 'wrapper.app-extension',
      settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
      includeInIndex: 0,
      path: `${TARGET_NAME}.appex`,
      sourceTree: 'BUILT_PRODUCTS_DIR',
    });
    const target = {
      uuid: targetUuid,
      pbxNativeTarget: {
        isa: 'PBXNativeTarget',
        name: TARGET_NAME,
        productName: TARGET_NAME,
        productReference: productFile.fileRef,
        productType: '"com.apple.product-type.app-extension"',
        buildConfigurationList: configurationList.uuid,
        buildPhases: [],
        buildRules: [],
        dependencies: [],
      },
    };
    project.addToPbxNativeTargetSection(target);
    project.addToPbxProjectSection(target);
    const projectUuid = project.getFirstProject().uuid;
    const projectObject = project.pbxProjectSection()[projectUuid];
    projectObject.attributes.TargetAttributes = projectObject.attributes.TargetAttributes || {};
    projectObject.attributes.TargetAttributes[targetUuid] = {
      LastSwiftMigration: 1250,
      ProvisioningStyle: 'Automatic',
      CreatedOnToolsVersion: '15.1',
    };

    const buildPath = '""';
    const folderType = 'app_extension';
    project.addBuildPhase(
      [SOURCE_FILE],
      'PBXSourcesBuildPhase',
      groupName,
      targetUuid,
      folderType,
      buildPath,
    );
    project.addBuildPhase(
      [],
      'PBXCopyFilesBuildPhase',
      groupName,
      project.getFirstTarget().uuid,
      folderType,
      buildPath,
    );
    project.buildPhaseObject('PBXCopyFilesBuildPhase', groupName, productFile.target).files.push({
      value: productFile.uuid,
      comment: `${productFile.basename} in ${productFile.group}`,
    });
    project.addToPbxBuildFileSection(productFile);
    project.addBuildPhase(
      [],
      'PBXFrameworksBuildPhase',
      groupName,
      targetUuid,
      folderType,
      buildPath,
    );
    project.addBuildPhase(
      [],
      'PBXResourcesBuildPhase',
      groupName,
      targetUuid,
      folderType,
      buildPath,
    );

    const group = project.addPbxGroup(
      [SOURCE_FILE, 'Info.plist', `${TARGET_NAME}.entitlements`],
      TARGET_NAME,
      TARGET_NAME,
    );
    const groups = project.hash.project.objects.PBXGroup;
    if (group.uuid) {
      Object.keys(groups).forEach((key) => {
        if (!groups[key]?.name && !groups[key]?.path) project.addToPbxGroup(group.uuid, key);
      });
    }
    return mod;
  });
}

module.exports = function withInstagramShare(config) {
  config = withShareConfig(config);
  config = withMainAppGroup(config);
  config = withShareIntent(config);
  config = withShareExtensionFiles(config);
  return withShareExtensionTarget(config);
};
