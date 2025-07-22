#!/usr/bin/env node

const ChildProcess = require('child_process');
const Fs = require('fs');
const Os = require('os');
const Minimist = require('minimist');

const CWD = process.cwd();

/**
 * Execute system command
 * @param {string} cmd
 * @param {(string | number)[]} args
 * @returns {Promise<string>}
 */
const runCmd = (cmd, args = []) => {
  return new Promise((resolve, reject) => {
    let job = ChildProcess.spawn(cmd, args);
    let data_buffers = [];
    let error_buffers = [];
    job.stdout.on('data', function (data) {
      data_buffers.push(data);
    });
    job.stderr.on('data', function (data) {
      error_buffers.push(data);
    });
    job.on('exit', function (code) {
      let data = Buffer.concat(data_buffers).toString();
      let error = Buffer.concat(error_buffers).toString();
      if (error) {
        reject(error);
      }
      resolve(data);
    });
  });
};

/**
 * Extract all releases info from git-log
 * @param {string} version
 * @returns {Promise<{tag:string, date:string, changelogs: Record<string, string>}[]>}
 */
const extractReleases = async function (version) {
  let res = '';
  res = await runCmd('git', ['log', '--decorate=short', '--pretty=format:%cd%d %s', '--date=format:%Y-%m-%d'])
  .catch(e => {
    throw new Error('extractReleases:' + e);
  });
  res = res.split('\n');

  let releases = [];

  for (let i = 0; i < res.length; i++) {
    let line = res[i].replace(/\(HEAD \-> [\w\-\/\.]+\)\s/i, '').replace(/HEAD \-> [\w\-\/\.]+,?\s?/i, '').replace(/[\w\-\/\.]+\/[\w\-\/\.]+/gi, '').replace(/,\s?/gi, '').replace(/\(\)/gi, '').replace(/\s{1,}/gi, ' ');
    let matched = line.match(/(\d{4}\-\d{2}\-\d{2})\s(\(.*(tag:\s*(v\d+\.\d+\.\d+))[^\)]*\)\s)?([^\(]+)(\(.+\))?:\s*(.+)/i);
    if (!matched) continue;
    let date = matched[1];
    let tag = matched[2] ? matched[2].substring(6, matched[2].length - 2) : undefined;
    let type = matched[5];
    let message = matched[7];

    if (tag) {
      releases.push({
        tag: tag,
        date: date,
        changelogs: {},
      });
    }
    else {
      if (releases.length == 0) {
        releases.push({
          tag: 'v' + version,
          date: date,
          changelogs: {},
        });
      }
      if (!releases[releases.length - 1].changelogs[type]) {
        releases[releases.length - 1].changelogs[type] = [];
      }
      releases[releases.length - 1].changelogs[type].push(message);
    }
  }

  return releases;
};

/**
 * Write changelogs into CHANGELOG.md
 * @param {{tag:string, date:string, changelogs: Record<string, string>}[]} releases
 * @param {Record<string, string>} types
 * @param {string} header
 * @returns {string}
 */
const writeChangelogFile = function (releases, types, header) {
  let show_types = Object.keys(types);

  let content = [
    header,
    '',
  ];
  let changelogs = [];
  releases.map((release, index) => {
    content.push('');
    content.push(`## ${release.tag} (${release.date})`);
    for (let i = 0; i < show_types.length; i++) {
      let type = show_types[i];
      if (typeof types[type] !== 'string' || !release.changelogs[type]) continue;
      content.push('');
      release.changelogs[type]
      .filter(function (item, index, arr) {
        return arr.indexOf(item, 0) === index;
      })
      .map(log => {
        content.push(`- ${types[type]}: ${log}`);
        if (index == 0) {
          changelogs.push(`- ${types[type]}: ${log}`);
        }
      });
    }
  });
  content.push('');
  content = content.join(Os.EOL);

  Fs.writeFileSync(CWD + '/CHANGELOG.md', content, {
    encoding: 'utf-8',
    flag: 'w+',
  });

  return changelogs.join(Os.EOL);
}

/**
 * Commit new release
 * @param {string} version
 * @param {string} changelogs
 */
const commitNewRelease = async function (version, changelogs) {

  console.log('(Git) Add files');
  await runCmd('git', ['add', '.'])
  .catch(e => {
    throw new Error('commitNewRelease.add: ' + e);
  });

  console.log('(Git) Commit release');
  await runCmd('git', ['commit', '-m', `chore(release): v${version}${Os.EOL}${Os.EOL}${changelogs}`])
  .catch(e => {
    throw new Error('commitNewRelease.commit: ' + e);
  });

  console.log('(Git) Add tag');
  await runCmd('git', ['tag', `v${version}`])
  .catch(e => {
    throw new Error('commitNewRelease.tag: ' + e);
  });
};

/**
 * Calculate next version
 * @param {string} version
 * @param {{version: string, type: string, help: boolean, push: boolean, 'upgrade-only': boolean}} args
 * @returns {string}
 */
const calNextVersion = function(version, args) {
  if (args.version) return args.version;

  let lastVersions = (version || '0.0.0').split('.');
  switch (args.type) {
    case 'major':
      lastVersions[0] = parseInt(lastVersions[0]) + 1;
      break;
    case 'minor':
      lastVersions[1] = parseInt(lastVersions[1]) + 1;
      break;
    case 'patch':
      lastVersions[2] = parseInt(lastVersions[2]) + 1;
      break;
    default:
      let lastPart = '', separator = '';
      for (let i = 2; i < lastVersions.length; i++) {
        lastPart += separator + lastVersions[i];
        separator = '.';
      }
      let index = lastPart.indexOf(args.type);
      let v = 0;
      if (index > -1) {
        let tmp = lastPart.split(args.type);
        if (tmp[1]) {
          let matched = tmp[1].match(/(\d+)$/g);
          if (matched) v = parseInt(matched[0]) || 0;
        }
      }
      lastVersions[2] = parseInt(lastPart) + '-' + args.type + '.' + (v + 1);
  }

  return lastVersions.slice(0, 3).join('.');
};

/**
 * Main function
 * @param {{version: string, type: string, help: boolean, push: boolean, 'upgrade-only': boolean}} args
 */
const main = async function (args) {
  let Package;
  try {
    Package = require(CWD + '/package.json');
  }
  catch (e) {
    throw new Error('The `package.json` not found or unreadable from folder: ' + CWD);
  }

  let header = '# CHANGELOG';
  let types = {
    'feat': 'Feat',
    'fix': 'Fix',
    'docs': 'Docs',
    'perf': 'Perf',
    'refactor': 'Refactor',
  };
  if (Package['package-release']) {
    if (typeof Package['package-release']['header'] == 'string') header = Package['package-release']['header'];
    if (typeof Package['package-release']['types'] == 'object') types = Package['package-release']['types'];
  }

  let nextVersion = calNextVersion(Package.version, args);

  console.log('Extract all releases');
  let releases = await extractReleases(nextVersion);
  if (nextVersion != releases[0].tag.substring(1)) {
    console.log('There is no commits for next version.');
    process.exit(0);
  }

  console.log('Write CHANGELOG.md');
  let changelogs = writeChangelogFile(releases, types, header);

  console.log('Write package.json');
  Package.version = nextVersion;
  Fs.writeFileSync(CWD + '/package.json', JSON.stringify(Package, null, 2).replaceAll('\n', Os.EOL) + Os.EOL, {
    encoding: 'utf-8',
    flag: 'w+',
  });

  if (!args['upgrade-only']) {
    await commitNewRelease(nextVersion, changelogs);
  }

  if (args.push) {
    await runCmd('git', ['push', '&&', 'git', 'push', '--tags'])
    .catch(e => {
      throw new Error('push: ' + e);
    });
    console.log(`v${nextVersion} is released and auto pushed to remote`);
  }
  else {
    console.log(`v${nextVersion} is released, you can run \`git push && git push --tags\` to push release with tag.`);
  }
};

(async () => {
  let args = Minimist(process.argv.slice(2), {
    alias: {
      h: 'help',
      t: 'type',
      v: 'version',
      p: 'push',
      u: 'upgrade-only',
    },
    default: {
      h: false,
      t: 'patch',
      v: '',
      p: false,
      u: false,
    }
  });

  if (args.help || typeof args.type !== 'string' || typeof args.version !== 'string') {
    console.log('Useage:');
    console.log('  package-release [-t major|minor|patch] [-v 1.0.0] [-p]');
    console.log('Options:');
    console.log('  -v\t--version\tThe version you want release.');
    console.log('  -t\t--type\t\tWhich part of version will be upgraded, options: major | minor | patch, default: patch');
    console.log('  \t\t\tYou also can set `alpha`, `beta` and so on, the version will be upgraded like: `1.0.0-alpha.1`.');
    console.log('  \t\t\tNote: This option will be ignored when the `version` has been set.');
    console.log('  -p\t--push\t\tIt will auto push changes to git remote when you set this option. default: false');
    console.log('  -u\t--upgrade-only\tIt will disable commit when you set this option. default: false');
    console.log('  -h\t--help');
    process.exit(0);
  }

  await main(args);
})()
.catch(e => {
  console.log('Error: ', e.message);
  process.exit(1);
});
