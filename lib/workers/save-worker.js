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
var sendMessage = null
var eventsToSave = {}

const saveCompresser = async (input, messageHandler, progress) => {
  let startedAt = Date.now()
  sendMessage = messageHandler
  let pendingSaveEvent = eventsToSave[input.filePath]
  sendMessage(input)
  if (input.clientInfo) {
    sendMessage('saveWorker running')
    clientInfo = input.clientInfo
  }
  else if (pendingSaveEvent) {
    // sendMessage(`pending save event: ${pendingSaveEvent}`)
    clearTimeout(pendingSaveEvent.timeout)
    pendingSaveEvent.content = input.text
    pendingSaveEvent.timeout = setTimeout(sendSaveEvent, 1000, pendingSaveEvent)
  }
  else {
    let knownProject = await getKnownProject(input.filePath)
    // sendMessage('knownProject')
    // sendMessage(knownProject)
    if (knownProject) {
      let saveEvent = {
        clientInfo,
        startedAt,
        content: input.text,
        filePath: input.filePath,
        project: knownProject
      }
      saveEvent.timeout = setTimeout(sendSaveEvent, 1000, saveEvent)
      eventsToSave[saveEvent.filePath] = saveEvent
    }
  }
}


async function sendSaveEvent(saveEvent) {
  saveEvent.endedAt = Date.now()
  delete saveEvent.timeout
  sendMessage(`sending content for ${saveEvent.filePath}.`)
  sendMessage(saveEvent)
  // fetch(`http://localhost:8010/nighthawk-1/us-central1/auth/save-event`,
  fetch(`https://us-central1-nighthawk-1.cloudfunctions.net/auth/save-event`,
  { method: 'POST',
    headers:
    {
      'Authorization': `Bearer ${clientInfo.token}`,
      'Content-Type': 'text/plain',
    },
    body: pako.gzip(JSON.stringify(saveEvent), { to: 'string' }),
    timeout: 0
  })
  .then(async resp => sendMessage(await resp.json()))
  .catch(err =>{sendMessage({err})})

  delete eventsToSave[saveEvent.filePath]
}

async function getKnownProject(filePath) {
  let eventObject = {}
  let shouldIgnore = false
  let repoInfo = await getGitInfo(filePath)
  // sendMessage('repoInfo')
  // sendMessage(repoInfo)
  // TODO: loop through all open project paths or look for project dir in filepath
  let localProjectName = repoInfo.root ? repoInfo.root.split('/').pop() : atom.project.getPaths()[0].split('/').pop()
  let knownProject = clientInfo.knownProjects.find(project => project.searchableName === localProjectName.toLowerCase())
  if (repoInfo.gitIgnore) {
    //TODO: need to add nighthawk .ignore
    shouldIgnore = ignore().add(repoInfo.gitIgnore).ignores(filePath)
  }
  if (knownProject && !shouldIgnore) {
    return {
      branches: knownProject.branches,
      fbID: knownProject.fbID,
      searchableName: knownProject.searchableName,
      repoInfo
    }
  }
  return null
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
