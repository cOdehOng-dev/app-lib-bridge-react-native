#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const packageAndroid = require('../scripts/packageAndroid');
const publishAndroid = require('../scripts/publishAndroid');
const packageIos = require('../scripts/packageIos');
const publishIos = require('../scripts/publishIos');

program
  .name('hongfield')
  .description('hongfield 빌드 및 배포 CLI')
  .version('1.0.0', '-V, --cli-version', 'CLI 버전 출력');

program
  .command('package:android')
  .description('Android AAR 빌드')
  .option('--variant <variant>', '빌드 variant (Debug | Release)', 'Release')
  .option('--module-name <name>', '출력 파일명', 'bridge-lib')
  .action((options) => {
    packageAndroid({ variant: options.variant, moduleName: options.moduleName });
  });

program
  .command('publish:android')
  .description('Android AAR을 로컬 Maven에 배포')
  .option('--module-name <name>', '모듈 이름', 'bridge-lib')
  .option('--version <version>', '배포 버전 (기본: build.gradle 값)')
  .option('--repo <path>', 'Maven 저장소 경로 (기본: ~/.m2/repository)')
  .action((options) => {
    publishAndroid({ moduleName: options.moduleName, version: options.version, repo: options.repo });
  });

program
  .command('package:ios')
  .description('iOS XCFramework 빌드')
  .option('--scheme <scheme>', 'Xcode 스킴 이름', 'BridgeLib')
  .option('--configuration <config>', '빌드 구성 (Debug | Release)', 'Release')
  .option('--output <path>', '출력 디렉터리 경로')
  .action((options) => {
    packageIos({
      scheme: options.scheme,
      configuration: options.configuration,
      output: options.output,
    });
  });

program
  .command('publish:ios')
  .description('iOS XCFramework를 로컬 CocoaPods 스펙 레포에 배포')
  .option('--module-name <name>', '모듈 이름', 'bridge-lib')
  .option('--group-id <id>', 'groupId', 'com.hong.lib')
  .option('--artifact-id <id>', 'artifactId (pod name)', 'hongfield')
  .option('--version <version>', '배포 버전')
  .option('--repo <path>', '로컬 스펙 레포 경로 (기본: ~/.cocoapods/local)')
  .action((options) => {
    publishIos({
      moduleName: options.moduleName,
      groupId: options.groupId,
      artifactId: options.artifactId,
      version: options.version,
      repo: options.repo,
    });
  });

program.parse(process.argv);
