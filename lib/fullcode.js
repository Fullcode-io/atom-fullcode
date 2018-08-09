'use babel';

import auth from './auth'
import {install_script} from './setup-bash-scripts'

const SelectListView = require('atom-select-list')
const {CompositeDisposable, Disposable} = require('event-kit')
const os = require('os');
const debounce = require('lodash.debounce');
const threads = require('threads')
const path = require('path');
const fs = require('fs-extra');
const fb = require("firebase");
const getRepoInfo = require('git-repo-info');

// atom.md5 = require("crypto-js/md5");
// atom.fb = fb
const config = {
  apiKey: 'AIzaSyAUnA-O2lHkwqoOy3tAkQnBcRgUgDpvUH0',
  authDomain: 'nighthawk-1.firebaseapp.com',
  databaseURL: 'https://nighthawk-1.firebaseio.com',
  storageBucket: 'nighthawk-1.appspot.com'
};
fb.initializeApp(config);
threads.config.set({basepath: { node: `${__dirname}/workers/` }})

const FullCode = {

  subscriptions: null,
  lockTailWorker: null,
  saveWorker: null,
  subscriptions: {dispose: () => {}},
  userProjectsRef: {off: () => {}},
  tokenUnsubscribe: () => {},
  scriptsInstalled: null,
  clientInfo: {},
  tile: null,

  async activate (state) {
    window.ignoreUtil = require('ignore');
    atom.deactivate = this.deactivate
    // atom.fc = this
    console.log('Starting Fullcode!');
    fb.auth().onAuthStateChanged(async user => {
      if (user) {
        this.user = user
        this.scriptsInstalled = await install_script()
        let introString =           `<dl style="font-size:20px;">
                    <dd>
                    <img src="${user.photoURL}" style="height:32px; width:32px;">
                    Logged into FullCode as: ${user.displayName || user.email}
                    </dd>
                  </dl>`;
        // console.log('user: ', user)
        atom.notifications.addSuccess(introString, {
          buttons: [
            {text: 'Logout', onDidClick() { signOut(); }}
          ],
          // description:
          // `<dl>
          //   <dt>Definition list</dt>
          //   <dd>Is something people use sometimes.</dd>
          //   <img src="https://avatars2.githubusercontent.com/u/3953136?v=4" style="height:32px; width:32px;">
          //   <dt>Markdown in HTML</dt>
          //   <dd>Does *not* work **very** well. Use HTML <em>tags</em>.</dd>
          // </dl>`,
          // dismissable: true

        });
        this.updateWorkers = debounce(this.updateWorkers , 2000, {leading: true});
        this.setupEventHandlers()
      }
      else {
        this.user = null
        // console.log('logged out')
        atom.notifications.addWarning(`FullCode: Uh Oh! You're not logged in!`, {
          detail: `Click Login to authenticate and start using FullCode`,
          buttons: [
            {text: 'Login', onDidClick() { authenticate(); }}
          ],
          dismissable: true
        });
      }
    });
  },

  consumeStatusBar (statusBar) {
    this.statusBar = statusBar
  },

  setupStatusBar() {
    let element = document.createElement('fullcode-status')
    element.classList.add('grammar-status', 'inline-block')
    let iconElement = document.createElement('span')
    element.classList.add('fullcode-status-icon')
    element.textContent = 'FC'
    element.prepend(iconElement)
    iconElement.classList.add('icon', 'icon-file-code', 'disabled')
    const clickHandler = (event) => {
      event.preventDefault()
      // console.log('icon clicked!')
      this.attach()
      // atom.commands.dispatch(atom.views.getView(atom.workspace.getActiveTextEditor()), 'grammar-selector:show')
    }
    element.addEventListener('click', clickHandler)
    // this.clickSubscription = new Disposable(() => { this.element.removeEventListener('click', clickHandler) })
    this.subscriptions.add({dispose: () => { element.removeEventListener('click', clickHandler) }})

    this.tile = this.statusBar.addRightTile({item: element })
    this.tooltip = atom.tooltips.add(element, {title: `Fullcode is Loading...`})

    // this.updateStatusIcon()
    // atom.commands.add('atom-workspace', 'fullcode:ignore-5', function(event) {
    // })
    let options =[
      {text: 'ignore all events for 5 mins', value: 300000},
      {text: 'ignore all events for 15 mins', value: 900000},
      {text: 'ignore all events for 45 mins', value: 2700000},
      {text: 'Resume tracking events', value: 0},
    ]
    this.selectListView = new SelectListView({
      itemsClassList: ['mark-active'],
      items: options,
      elementForItem: (option) => {
        const item = document.createElement('li')
        item.textContent = option.text
        return item
      },
      didConfirmSelection: (selection) => {
        this.cancel()
        let ignoreEventsUntil = Date.now() + selection.value
        if (this.stopIgnoringTimeout) {
          clearTimeout(this.stopIgnoringTimeout)
          this.stopIgnoringTimeout = null
        }
        let path = `auth_data/${this.user.uid}`
        this.updateIgnoreUntil(ignoreEventsUntil)
        this.stopIgnoringTimeout = setTimeout(this.updateIgnoreUntil, selection.value, 0, path)

      },
      didCancelSelection: () => {
        this.cancel()
      }
    })
  },

  updateIgnoreUntil(unixTimestamp, path) {
    path = path || `auth_data/${this.user.uid}`
    console.log('updating ignoreUntil: ', unixTimestamp)
    fb.database().ref(path).update({ignoreEventsUntil: unixTimestamp})
  },

  attach () {
    this.previouslyFocusedElement = document.activeElement
      if (this.panel == null) {
        this.panel = atom.workspace.addModalPanel({item: this.selectListView})
      }
    this.selectListView.focus()
    this.selectListView.reset()
  },

  cancel() {
    if (this.panel != null) {
      this.panel.destroy()
    }
      this.panel = null
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus()
      this.previouslyFocusedElement = null
    }
  },

  async getClientInfo(user) {
    process.versions[process.platform] = os.release()
    let systemInfo = {
      platform: process.platform,
      release: os.release(),
      versions: process.versions,
      dirname: __dirname,
      EOL: os.EOL,
      pathSep: path.sep,
      // userInfo: os.userInfo()
    }
    return {
      token: await user.getIdToken(),
      fbID: user.uid,
      apiKey: config.apiKey,
      refreshToken: user.refreshToken,
      // trackedProjects: this.trackedProjects,
      authData: this.authData,
      systemInfo
    }
  },

  killWorkers() {
    // console.log('clearing workers')
    if (this.lockTailWorker) {
      this.lockTailWorker.kill().removeAllListeners()
      this.lockTailWorker = null
    }
    if (this.saveWorker) {
      this.saveWorker.kill().removeAllListeners()
      this.saveWorker = null
    }
  },

  deactivate() {
    this.killWorkers()
    this.tokenUnsubscribe()
    this.subscriptions.dispose()
    this.userProjectsRef.off()
    if (this.stopIgnoringTimeout) {
      clearTimeout(this.stopIgnoringTimeout)
    }
    if (this.tile) {
      this.tile.destroy()
    }
  },

  async updateWorkers(user) {
    let clientInfo = await this.getClientInfo(user)
    console.log('updating workers', clientInfo)
    if (this.lockTailWorker) {
      // console.log('sending to lockTailWorker: ')
      this.lockTailWorker.send({clientInfo})
    }
    if (this.saveWorker) {
      this.saveWorker.send({clientInfo})
    }
    this.clientInfo = clientInfo
    this.updateStatusIcon()
},

  updateStatusIcon(message) {
    if (!this.tile) {
      this.setupStatusBar()
    }
    let currentProjectPath = atom.project.getPaths().pop()
    if (message) {
      let foundProject = message.response
      let saveIconClass = '.icon-file-code'
      let now = Date.now()
      let isSleeping = this.clientInfo.authData.ignoreEventsUntil >= now
      if (this.tooltip) {
        this.tooltip.dispose()
        this.tooltip = null
      }
      console.log('foundProject: ', foundProject)
      console.log('isSleeping: ', isSleeping)
      if (foundProject && !isSleeping) {
        // if current project dir is a trackedProject then show active
        this.tile.item.querySelector(saveIconClass).classList.add('active')
        this.tile.item.querySelector(saveIconClass).classList.remove('disabled')
        let projectType = foundProject.isPrivate ? 'private' : 'public'
        this.tooltip = atom.tooltips.add(this.tile.item, {title: `Tracking events for ${projectType} project: ${message.response.searchableName}`})
      }
      else {
        // show yellow so user knows nothing here is leaving client
        this.tile.item.querySelector(saveIconClass).classList.remove('active')
        this.tile.item.querySelector(saveIconClass).classList.add('disabled')
        // let title = `This directory is not whitelisted for tracking.`
        let title = `No approved projects were found in this directory: ${currentProjectPath}`
        if (isSleeping) {
          // timeUp = new Date(this.clientInfo.authData.ignoreEventsUntil * 1000)
          // let timeLeft = Math.round((this.clientInfo.authData.ignoreEventsUntil - Date.now())/(60*1000))
          title = `Fullcode is ignoring all events for a few mins`
        }
        this.tooltip = atom.tooltips.add(this.tile.item, {title})
      }
    }
    else {
      this.saveWorker.send({task: 'updateStatusIcon', path: currentProjectPath})
    }
  },

  async setupEventHandlers() {
    this.tokenUnsubscribe = fb.auth().onIdTokenChanged(async user => {
      if (user) {
        if (this.scriptsInstalled && !this.lockTailWorker) {
          console.log('starting locktail worker')
          this.lockTailWorker = threads.spawn('lock-tail-worker.js')
          .on('message', (message) => {
            let err = message ? message.err : {}
            if (err && (err.code === 'ENOTACQUIRED' || err.code === 'ELOCKED')) {
              return
            }
            console.log(message)
            // manually check if user needs new token... this shouldn't be necessary but firebase
            // isn't triggering "IDTokenChanged" events when manually refreshed via http from backend
            user.getIdToken().catch(e => {})
            // console.log('lockTail: ', message);
            let ignoreUntil = this.clientInfo.authData.ignoreEventsUntil
            if (ignoreUntil !== 0 && ignoreUntil <= Date.now()) {
              this.updateIgnoreUntil(0)
            }
          })
        }
        if (!this.saveWorker) {
          this.saveWorker = threads.spawn('save-worker.js')
          .on('message', (message) => {
            // console.log(message)
            if (message && message.task) {
              // call message task again with response... for now updateStatusIcon is only task
              this[message.task](message)
            }
            // console.log(message)
            // manually check if user needs new token...
            user.getIdToken().catch(e => {})
            let ignoreUntil = this.clientInfo.authData.ignoreEventsUntil
            if (ignoreUntil !== 0 && ignoreUntil <= Date.now()) {
              this.updateIgnoreUntil(0)
            }
            // console.log('saveWorker: ', message);
          })
        }
        if (!this.subscriptions.add) {
          // if there is no ".add" then we aren't listening
          // console.log('adding save watcher')
          this.subscriptions = new CompositeDisposable
          atom.workspace.observeTextEditors( (editor) => {
            let buffer = editor.getBuffer();

            this.subscriptions.add(buffer.onDidSave((e) => {
              let file = buffer.file
              let filePath = file ? file.path : e.path
              let relativePath = atom.project.relativizePath(filePath).pop()
              console.log('save detected.. sending to worker ')
              this.saveWorker.send({filePath, relativePath, text: buffer.getText()});
            }));
          });
          this.userAuthData = fb.database().ref(`auth_data/${user.uid}`)
          this.userAuthData.on('value', async (snap) => {
            let authData = snap.val() || {}
            // this.trackedProjects = authData.trackedProjects || []
            this.authData = authData || {}
            // this.trackedProjects = Object.values(projects).filter(project => project.isTracked)
            this.updateWorkers(user)
          })
        }
        else {
          this.updateWorkers(user)
        }
      }
      else {
        // console.log('deactivating')
        this.deactivate()
      }
    });

  },
}


function authenticate() {
  auth().then((resp, err) => {
    // console.log(resp)
    let credential = fb.auth.GithubAuthProvider.credential(resp.accessToken)
    return fb.auth().signInWithCredential(credential).catch( (error) => {
      console.error(error);
    });
  })
}

function signOut() {
  fb.auth().signOut().then(() => {
    // console.log('signed out')
  }).catch((error) => {
    console.error(error)
  });
};

module.exports = FullCode;

Object.defineProperty(navigator, 'onLine', {
    get: function() {
      return true;
    },
    set: function() {}
  });
