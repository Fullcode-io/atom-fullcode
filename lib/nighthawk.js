'use babel';

import auth from './auth'
import {install_script} from './setup-bash-scripts'

const os = require('os');
const threads = require('threads')
const path = require('path');
const fs = require('fs-extra');
const firebase = require("firebase");
const getRepoInfo = require('git-repo-info');

// atom.firebase = firebase
const config = {
  apiKey: 'AIzaSyAUnA-O2lHkwqoOy3tAkQnBcRgUgDpvUH0',
  authDomain: 'nighthawk-1.firebaseapp.com',
  databaseURL: 'https://nighthawk-1.firebaseio.com',
  storageBucket: 'nighthawk-1.appspot.com'
};
firebase.initializeApp(config);
threads.config.set({basepath: { node: `${__dirname}/workers/` }})

const Nighthawk = {

  systemInfo: null,
  lockTailWorker: null,
  saveWorker: null,
  saveHandler: null,
  knownProjects: ['nighthawk-atom', 'nighthawk', 'nighthawk-functions'],

  async activate (state) {
    console.log('STARING Nighthawk');

    firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
        atom.notifications.addSuccess(`🐦 Nighthawk: Logged in as ${user.displayName}`, {
          buttons: [
            {text: 'Logout', onDidClick() { signOut(); }}
          ]
        });
        this.systemInfo = await this.refreshSystemInfo()
        console.log(this.systemInfo)
        let isWindows = /^win/.test(this.systemInfo.platform)
        if (!isWindows) {
          let scriptsInstalled = await install_script()
          if (scriptsInstalled && !this.lockTailWorker) {
            this.lockTailWorker = threads.spawn('lock-tail-worker.js').send({systemInfo: this.systemInfo})
          }
        }
        if (!this.saveWorker) {
          this.saveWorker = threads.spawn('save-worker.js').send({systemInfo: this.systemInfo})
        }
        this.setupEventHandlers()
      }
      else {
        console.log('clearing workers')
        this.killWorkers()
        atom.notifications.addWarning(`🐦 Nighthawk: Uh Oh! You're not logged in!`, {
          detail: `Click Login to authenticate and start using Nighthawk`,
          buttons: [
            {text: 'Login', onDidClick() { authenticate(); }}
          ]
        });
      }
    });
  },

  async refreshSystemInfo() {
    let systemInfo = {
      platform: process.platform,
      release: os.release(),
      versions: process.versions,
      dirname: __dirname,
      hostName: os.hostname(),
      EOL: os.EOL,
      token: await firebase.auth().currentUser.getIdToken(),
      knownProjects: this.knownProjects
    }
    return Object.assign(systemInfo, os.userInfo())
  },

  killWorkers() {
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
    if (this.saveHandler) {
      this.saveHandler.dispose()
    }
  },

  setupEventHandlers() {
    if (this.lockTailWorker) {
      this.lockTailWorker.on('message', async (message) => {
        if (message === 'ENOTACQUIRED' || message === 'ELOCKED') {
          return
        }
        console.log('lockTail: ', message);
      })
    }
    if (this.saveWorker) {
      this.saveWorker.on('message', (message) => {
        console.log('saveWorker: ', message);
      })
    }
    if (!this.saveHandler) {
      atom.workspace.observeTextEditors( (editor) => {
        let buffer = editor.getBuffer();

        this.saveHandler = buffer.onDidSave((e) => {
          let file = buffer.file
          let filePath = file ? file.path : e.path
          console.log('save detected.. sending to worker ');
          this.saveWorker.send({filePath: filePath, text: buffer.getText()});
        });
      });
    }
  },
}

function authenticate() {
  auth().then((resp, err) => {
    console.log(resp)
    let credential = firebase.auth.GithubAuthProvider.credential(resp.accessToken)
    return firebase.auth().signInWithCredential(credential).catch( (error) => {
      console.error(error);
    });
  })
}

function signOut() {
  firebase.auth().signOut().then(() => {
    console.log('signed out')
  }).catch((error) => {
    console.error(error)
  });
};

module.exports = Nighthawk;
