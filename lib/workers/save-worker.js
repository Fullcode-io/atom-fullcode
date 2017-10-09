'use babel';
process.on('disconnect', process.exit);

const fetch = require('node-fetch');
const pako = require('pako');
const getRepoInfo = require('git-repo-info');
const debounce = require('lodash.debounce');
const fs = require('fs-extra');
const path = require('path');
const ignore = require('ignore')
var clientInfo = null
var pendingFile = null
var pendingText = null
var sendMessage = null
var startTime = null

const sendSaveEvent = debounce( () => {
  sendMessage(`sending content for ${pendingFile}`)
  let endTime = new Date
  let repoInfo = getGitInfo(pendingFile)
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

const saveCompresser = (input, messageHandler, progress) => {
  sendMessage = messageHandler

  if (input.clientInfo) {
    sendMessage('saveWorker running')
    if (!clientInfo) {
      // let githubID = user.providerData.find(provider => provider.providerId.includes("github.com")).uid
      // let githubInfo = await fetch(`https://api.github.com/user/${githubID}`).then(resp => resp.json())
      // console.log(githubInfo)
    }
    clientInfo = input.clientInfo
  }
  else if (input.filePath && canSaveFile(input.filePath)){
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

function getGitInfo(filePath) {
  let repoInfo = getRepoInfo(filePath)
  let gitRoot = repoInfo.root
  if (gitRoot && fs.pathExistsSync(`${gitRoot}/.gitignore`)) {
    repoInfo.gitIgnore = fs.readFileSync(`${gitRoot}/.gitignore`, {encoding: 'utf8'})
  }
  return repoInfo
}

function canSaveFile(filePath) {
  let shouldIgnore = false
  let repoInfo = getGitInfo(filePath)
  let gitRoot = repoInfo.root
  let knownGitProject = gitRoot && clientInfo.knownProjects.includes(gitRoot.split(path.sep).pop())
  let knownProject = knownGitProject || clientInfo.knownProjects.some((project) => filePath.includes(`${path.sep}${project}${path.sep}`))
  if (knownProject && repoInfo.gitIgnore) {
    shouldIgnore = ignore().add(repoInfo.gitIgnore).ignores(filePath)
  }
  return knownProject && !shouldIgnore
}

module.exports = saveCompresser;
