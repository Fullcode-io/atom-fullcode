'use babel';
process.on('disconnect', process.exit);

const fetch = require('node-fetch');
const lockFile = require('proper-lockfile');
const Tail = require('tail').Tail;
const rotator = require('logrotator').rotator;
const pako = require('pako');
const getRepoInfo = require('git-repo-info');
const remoteOrigin = require('remote-origin-url');
const debounce = require('lodash.debounce');
const fs = require('fs-extra');
const os = require('os')
const path = require('path');

const home = os.homedir()
const lockPath = home + '/.nighthawk/logs/nighthawk'
const logFilePath = home + '/.nighthawk/logs/session.log'
var tail = null
var lines = []
var clientInfo = null
var sendMessage = null
var lockFileHandler = null

var fileSizeLimit = { type: 'integer', default: 262144 }

const sendLogs = debounce( () => {
  let payload = { projects: {} };
  let payloadProjects = payload.projects;
  lines.forEach(line => {
    let logPath = line.split('|//🐦//|')[0] || "";
    let knownProject = clientInfo.knownProjects.find(project => {
      let projectName = project.name || project.hostInfo.name
      return logPath.includes(`${path.sep}${projectName}${path.sep}`)
    })
    if (knownProject) {
      let projectName = knownProject.name || knownProject.hostInfo.name
      // unhandled edge case if user is working in the same repo in different
      // directories on different branches at the same time
      payloadProjects[projectName] = payloadProjects[projectName] || {name: projectName, lines: [], logPath }
      payloadProjects[projectName].lines.push(line)
    }
  })
  let projectNames = Object.keys(payloadProjects)
  // unhandled edge case here when user is active in terminal while switching branches... the
  // latter branch may "steal" some lines
  if (projectNames.length) {
    projectNames.forEach(projectName => {
      let payloadProject = payloadProjects[projectName]
      let repoInfo = getRepoInfo(payloadProject.logPath)
      repoInfo.remoteOrigin = remoteOrigin.sync(`${repoInfo.root}/.git/config`)
      payloadProject = Object.assign(payloadProject, { repoInfo }, { clientInfo })
    })

    // sendMessage(`projects: ${projectNames.length} lines: ${lines.length}`)
    sendMessage(payload)
    // fetch(`http://localhost:5000/nighthawk-1/us-central1/auth/log-event`,
    fetch(`https://us-central1-nighthawk-1.cloudfunctions.net/auth/log-event`,
    { method: 'POST',
      headers:
      {
        'Authorization': `Bearer ${clientInfo.token}`,
        'Content-Type': 'text/plain',
        'Refresh-Token': `${clientInfo.refreshToken}`
      },
      body: pako.gzip(JSON.stringify(payload), { to: 'string' })
    }).then(async resp => sendMessage(await resp.json()))
    .catch(err => sendMessage({err}))
  }
  startTime = null;
  lines.length = 0;
}, 3000)

const lockTail = (input, messageHandler, progress) => {
  sendMessage = messageHandler
  if (input.clientInfo) {
    clientInfo = input.clientInfo
    sendMessage('lock-tail running');
  }

  lockFileHandler = lockFileHandler || setInterval(() => {
    // creates or checks lockfile every 5 seconds... if stale attempts to takes over
    lockFile.lock(lockPath, { stale: 5000, realpath: false, updateDelay: 1000 }, (err) => {
      if (err) {
        if (err.code !== 'ELOCKED' && tail ) {
          // this means lockfile was compromised either by being
          // touched, removed or went stale and another client took over
          tail.unwatch();
          tail = null;
        }
        sendMessage({err})
        return
      }

      tailLogFile();
      sendMessage('Took over lock file');
    });
  }, 5000);
}

const tailLogFile = () => {
  tail = new Tail(logFilePath);
  tail.on('line', (line) => {
    lines.push(line)
    // arbitrary flush threshold
    if (lines.length >= 50000) {
      sendLogs.flush()
    }
    else {
      sendLogs()
    }
  });
  // checks every 5 mins if log file is >= 5mb... if so gzips & rotates
  rotator.register(logFilePath,
    { size: '5m', count: 3 }
  );

  tail.on('error', (err) => {
    sendMessage({err});
  });
}

module.exports = lockTail;
