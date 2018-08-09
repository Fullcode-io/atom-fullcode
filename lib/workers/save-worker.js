'use babel';
process.on('disconnect', process.exit);

const fetch = require('node-fetch');
const pako = require('pako');
const getRepoInfo = require('git-repo-info');
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

  sendMessage('saveWorker running')

  if (input.clientInfo) {
    // sendMessage('in input.clientInfo ', input)
    clientInfo = input.clientInfo
  }
  else if (input.task) {
    sendMessage('task recieved')
    switch (input.task) {
      case 'updateStatusIcon':
        (async (input) => {
          input.response = await getTrackedProject(input.path)
          sendMessage(input)
       }).call(this, input)
        break;
      default: sendMessage({badRequest: input})
    }
  }
  else if (pendingSaveEvent) {
    sendMessage(`pending save event: ${pendingSaveEvent}`)
    clearTimeout(pendingSaveEvent.timeout)
    pendingSaveEvent.content = input.text
    pendingSaveEvent.timeout = setTimeout(sendSaveEvent, 2000, pendingSaveEvent)
  }
  else if (input && input.filePath) {
    let trackedProject = await getTrackedProject(input.filePath)
    sendMessage(trackedProject)
    if (trackedProject) {
      let saveEvent = {
        clientInfo,
        startedAt,
        content: input.text,
        filePath: input.filePath,
        relativePath: input.relativePath,
        project: trackedProject
      }
      saveEvent.timeout = setTimeout(sendSaveEvent, 2000, saveEvent)
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

async function getTrackedProject(filePath) {
  let pathSep = clientInfo.systemInfo.pathSep
  let trackedProjects = clientInfo.authData.trackedProjects || []
  let eventObject = {}
  let shouldIgnore = false
  let repoInfo = await getGitInfo(filePath)
  sendMessage('repoInfo')
  sendMessage(repoInfo)
  // TODO: loop through all open project paths or look for project dir in filepath

// use something like this to get projectName:
// basename -s .git `git config --get remote.origin.url`
// pass in relativePath from main thread


  let localProjectName = repoInfo.root ? repoInfo.root.split(pathSep).pop() : ''
  sendMessage(localProjectName)
  let trackedProject = Object.entries(trackedProjects).find(proj => proj[1] === localProjectName.toLowerCase())
  // above line will return an array of ['key', 'val'] if a match was found
  // https://stackoverflow.com/a/36705765/2221361
  trackedProject = trackedProject ? {id: trackedProject[0], searchableName: trackedProject[1]} : null
  if (repoInfo.gitIgnore) {
    //TODO: need to add nighthawk .ignore
    shouldIgnore = ignore().add(repoInfo.gitIgnore).ignores(filePath)
  }
  sendMessage(trackedProject)
  if (trackedProject && !shouldIgnore) {
    let publicProjects = clientInfo.authData.projectIndexes.public
    let privateProjects = clientInfo.authData.projectIndexes.private
    let isPrivate = !!privateProjects[trackedProject.id]
    // let isPrivate = true
    // if (publicProjects) {
    //   isPrivate = !publicProjects[trackedProject.id]
    // }
    return {
      id: trackedProject.id,
      searchableName: trackedProject.searchableName,
      repoInfo,
      isPrivate
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
