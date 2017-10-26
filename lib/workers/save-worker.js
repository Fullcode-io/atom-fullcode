'use babel';
process.on('disconnect', process.exit);

const fetch = require('node-fetch');
const pako = require('pako');
const getRepoInfo = require('git-repo-info');
const debounce = require('lodash.debounce');
const fs = require('fs-extra');
const path = require('path');
const ignore = require('ignore');
const remoteOrigin = require('remote-origin-url');
var clientInfo = null
var pendingFile = null
var pendingText = null
var sendMessage = null
var startTime = null

const sendSaveEvent = debounce( async () => {
  sendMessage(`sending content for ${pendingFile}`)
  let endTime = new Date
  let repoInfo = await getGitInfo(pendingFile)
  let payload = {
    text: pendingText,
    filePath: pendingFile,
    startTime,
    endTime,
    repoInfo,
    clientInfo
  }
  sendMessage(payload)
  // fetch(`http://localhost:5000/nighthawk-1/us-central1/app/log-event`,
  // { method: 'POST',
  //   headers:
  //   {
  //     'Authorization': `Bearer ${clientInfo.token}`,
  //     'Content-Type': 'text/plain',
  //   },
  //   body: pako.gzip(JSON.stringify(payload), { to: 'string' })
  // }).catch(err => sendMessage(err))
  // pendingFile = null
  // pendingText = null
  startTime = null
}, 2000)

const saveCompresser = async (input, messageHandler, progress) => {
  sendMessage = messageHandler

  if (input.clientInfo) {
    sendMessage('saveWorker running')
    clientInfo = input.clientInfo
  }
  else if (input.filePath && await canSaveFile(input.filePath)){
    startTime = startTime || new Date
    // if incoming save is for same file then update pendingText but keep debouncing...
    // otherwise flush
    if (input.filePath !== pendingFile) {
      sendSaveEvent.flush()
      pendingFile = input.filePath
      pendingText = input.text
      sendSaveEvent()
    }
    // don't save if nothing changed!
    else if (pendingText !== input.text) {
      pendingText = input.text
      sendSaveEvent()
    }
  }
}

async function canSaveFile(filePath) {
  let shouldIgnore = false
  let isUserProject = false
  let repoInfo = await getGitInfo(filePath)
  let remoteURL = repoInfo.remoteOrigin
  if (remoteURL) {
    isUserProject = clientInfo.knownProjects.some(project => {
      let fullName = project.hostInfo.full_name
      return remoteURL.includes(`${project.hostInfo.full_name}`)
    })
  }
  else {
    // if here then not a repo or has no remoteURL (thus likely a local git init)
    isUserProject = clientInfo.knownProjects.some(project => {
      let projectName = project.name || project.hostInfo.name
      return filePath.includes(`${path.sep}${projectName}${path.sep}`)
    })
  }
  if (isUserProject && repoInfo.gitIgnore) {
    // need to add nighthawk .ignore
    shouldIgnore = ignore().add(repoInfo.gitIgnore).ignores(filePath)
  }
  return isUserProject && !shouldIgnore
}

async function getGitInfo(filePath) {
  let repoInfo = getRepoInfo(filePath)
  let gitRoot = repoInfo.root
  repoInfo.remoteOrigin = remoteOrigin.sync(`${gitRoot}/.git/config`)
  if (gitRoot && await fs.pathExists(`${gitRoot}/.gitignore`)) {
    repoInfo.gitIgnore = await fs.readFile(`${gitRoot}/.gitignore`, {encoding: 'utf8'})
  }
  return repoInfo
}

module.exports = saveCompresser;
