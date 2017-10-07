'use babel';
process.on('disconnect', process.exit);

const fetch = require('node-fetch');
const pako = require('pako');
const getRepoInfo = require('git-repo-info');
const debounce = require('lodash.debounce');
const fs = require('fs-extra');
const path = require('path');

var systemInfo = null
var pendingFile = null
var pendingText = null
var sendMessage = null
var timestamp = null
var gitInfo = null

const sendSaveEvent = debounce( () => {
  sendMessage(`sending content for ${pendingFile}`)
  if (canSaveFile(pendingFile)) {
    let payload = {
      text: pendingText,
      filePath: pendingFile,
      timestamp,
      gitInfo,
      systemInfo
    }
    // sendMessage(payload)
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
  pendingFile = null
  pendingText = null
}, 15000)

const saveCompresser = (input, messageHandler, progress) => {
  sendMessage = messageHandler

  if (input.systemInfo) {
    sendMessage('init saveWorker')
    systemInfo = input.systemInfo
  }
  else {
    timestamp = new Date
    // if incoming save is for same file then keep debouncing otherwise flush
    if (input.filePath !== pendingFile) {
      sendSaveEvent.flush()
      pendingFile = input.filePath
      pendingText = input.text
      sendSaveEvent()
    }
    else {
      pendingText = input.text
      sendSaveEvent()
    }
  }
}

function canSaveFile(filePath) {
  let shouldIgnore = false
  let gitIgnore = null
  gitInfo = getRepoInfo(filePath)
  let gitRoot = gitInfo.root
  let gitProject = gitRoot && systemInfo.knownProjects.includes(gitRoot.split(path.sep).pop())
  let knownProject = gitProject || systemInfo.knownProjects.some((project) => filePath.includes(`${path.sep}${project}${path.sep}`))
  if (fs.pathExistsSync(`${gitRoot}/.gitignore`)) {
    gitIgnore = fs.readFileSync(`${gitRoot}/.gitignore`, {encoding: 'utf8'})
    let ignorables = gitIgnore.split(systemInfo.EOL).filter((ignorable) => ignorable != "")
    shouldIgnore = ignorables.some((ignoreMe) => filePath.includes(ignoreMe))
  }
  gitInfo.gitIgnore = gitIgnore
  return knownProject && !shouldIgnore
}

module.exports = saveCompresser;
