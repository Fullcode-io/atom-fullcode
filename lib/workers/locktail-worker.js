'use babel';
process.on('disconnect', process.exit);

const fetch = require('node-fetch');
const lockFile = require('proper-lockfile');
const Tail = require('always-tail');
const rotator = require('logrotator').rotator;
const pako = require('pako');
const getRepoInfo = require('git-repo-info');
const debounce = require('lodash.debounce');
const fs = require('fs-extra');
const os = require('os')
const path = require('path');

const home = os.homedir()
const lockPath = home + '/.nighthawk/logs/nighthawk'
const logFilePath = home + '/.nighthawk/logs/session.log'
var tail = null
var lines = []
var firstTimestamp = null
var systemInfo = null
var sendMessage = null

var fileSizeLimit = { type: 'integer', default: 262144 }

const sendLogs = debounce( () => {
  let payload = {};
  lines.forEach((line) => {
    let logPath = line.split('|//🐦//|')[0]
    let knownProject = systemInfo.knownProjects.find(project => logPath.includes(`${path.sep}${project}${path.sep}`))
    if (knownProject) {
      // There's an obscure edge case here not being handled if user is working in the same repo
      // but in different directories on different branches at the same time
      payload[knownProject] = payload[knownProject] || { lines: [], logPath }
      payload[knownProject].lines.push(line)
    }
  })
  let projectNames = Object.keys(payload)
  if (projectNames.length) {
    let lastTimestamp = new Date
    projectNames.forEach(projectName => {
      let projectPayload = payload[projectName]
      let metadata = {
        firstTimestamp,
        lastTimestamp,
        gitInfo: getRepoInfo(projectPayload.logPath),
        systemInfo
      }
      projectPayload = Object.assign(projectPayload, metadata)
    })
    // sendMessage(`projects: ${projectNames.length} lines: ${lines.length}`)
    sendMessage(payload)
    fetch(`http://localhost:5000/nighthawk-1/us-central1/app/log-event`,
    { method: 'POST',
      headers:
      {
        'Authorization': `Bearer ${systemInfo.token}`,
        'Content-Type': 'text/plain',
      },
      body: pako.gzip(JSON.stringify(payload), { to: 'string' })
    }).catch(err => sendMessage(err))
  }
  firstTimestamp = null;
  lines.length = 0;
}, 15000)

const lockTail = (input, messageHandler, progress) => {
  sendMessage = messageHandler

  if (systemInfo) {
    // if systemInfo already exists then we're just refreshing value
    // and don't want to start a second lockFile watcher
    systemInfo = input.systemInfo
    return
  }
  else {
    systemInfo = input.systemInfo
  }

  sendMessage('lock-tail started');

  setInterval(() => {
    // create or check lockfile every 5 seconds... if stale take over
    lockFile.lock(lockPath, { stale: 5000, realpath: false, updateDelay: 1000 }, (err) => {
      if (err) {
        if (err.code !== 'ELOCKED' && tail ) {
          tail.unwatch();
          tail = null;
          console.log('cleared tail: ', err.code)
        }
        sendMessage(err.code)
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
    firstTimestamp = firstTimestamp || new Date
    lines.push(line)
    // arbitrary flush threshold
    if (lines.length >= 50000) {
      sendLogs.flush()
    }
    else {
      sendLogs()
    }
  });

  rotator.register(logFilePath,
    { schedule: '5m', size: '5m', compress: true, count: 2 }
  );

  tail.on('error', (error) => {
    sendMessage(error);
  });
}

module.exports = lockTail;
