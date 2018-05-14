'use babel';

const os = require('os');
const fs = require('fs-extra');
const promiseRetry = require('promise-retry');

async function install() {
  let homeDir = os.homedir()
  let fullcodeDir = `${homeDir}/.fullcode`

  let scriptCall = `${os.EOL}# This asks to start fullcode in current process if not already running${os.EOL}. ${homeDir}/.fullcode/fullcode.sh${os.EOL}alias fullcode=". $HOME/.fullcode/fullcode.sh"${os.EOL}`
  try {
    await fs.ensureDir(`${fullcodeDir}/logs`)
    await fs.ensureFile(`${fullcodeDir}/logs/session.log`)
    await fs.copy(`${__dirname}/bash-scripts/fullcode.sh`, `${fullcodeDir}/fullcode.sh`)
    // create .bashrc file if necessary and add fullcode.sh script if not already present
    await fs.ensureFile(`${homeDir}/.bashrc`)
    let bashrc = await fs.readFile(`${homeDir}/.bashrc`, {encoding: 'utf8'})
    if (!bashrc.includes("/.fullcode/fullcode.sh")) {
      await fs.appendFile(`${homeDir}/.bashrc`, scriptCall)
    }

    // login shells don't call .bashrc by default when opening up a new terminal session but
    // fullcode.sh has to run inside of bashrc. So in order for nightawk to auto start we must
    // run bashrc via bash_profile or similar. This code creates a bash_profile if necessary
    // and then adds a line to call ./bashrc
    let bashProfile = await fs.pathExists(`${homeDir}/.bash_profile`) ? '.bash_profile' : null
    let bashLogin = await fs.pathExists(`${homeDir}/.bash_login`) ? '.bash_login' : null
    let profile = await fs.pathExists(`${homeDir}/.profile`) ? '.profile' : null

    let profileType = bashProfile || bashLogin || profile || '.bash_profile'

    await fs.ensureFile(`${homeDir}/${profileType}`)
    let systemProfile = await fs.readFile(`${homeDir}/${profileType}`, {encoding: 'utf8'})
    let callBashrc = `${os.EOL}# FullCode requires .bashrc to be sourced when auto-starting${os.EOL}[ -s $HOME/.bashrc ] && . $HOME/.bashrc${os.EOL}`

    // sourcing bashrc is common so should be checked for... we don't want to source it twice
    if (!systemProfile.includes(callBashrc) && !systemProfile.includes("/.bashrc")) {
      await fs.appendFile(`${homeDir}/${profileType}`, callBashrc)
    }
    return true
  } catch (err) {
      throw err
  }
};

export function install_script() {
  // bash on windows isn't quite there yet
  let isCompatiable = !/^win/.test(process.platform) && os.userInfo().shell.includes('bash');
  // when multiple clients attempt to install at once certain race conditions exist
  // which can cause benign errors... Retry a couple times before throwing error
  return isCompatiable && promiseRetry({retries: 2, randomize: true}, (retry, num) => {
      return install()
      .catch((err) => {
        console.warn(`${err.code} error trying to install fullcode bash scripts... trying ${3 - num} more times`)
        retry(err);
      });
  })
  .then((response) => response, (err) => {
    console.error(err)
    atom.notifications.addWarning(`FullCode: There was an error setting up FullCode scripts on your sytem. This will only prevent FullCode from running in your terminal (not save events):${os.EOL}${os.EOL}${err}`,
      {dismissable: true}
    )
    return false
  });
}
