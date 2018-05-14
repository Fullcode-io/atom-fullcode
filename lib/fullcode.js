'use babel';

import auth from './auth'
import {install_script} from './setup-bash-scripts'

const {CompositeDisposable} = require('event-kit')
const os = require('os');
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
  knownProjects: [],

  async activate (state) {
    atom.deactivate = this.deactivate
    // atom.fc = this
    console.log('STARING FullCode');
    fb.auth().onAuthStateChanged(async user => {
      if (user) {
        this.scriptsInstalled = await install_script()
        let introString =           `<dl style="font-size:20px;">
                    <dd>
                    <img src="https://avatars2.githubusercontent.com/u/3953136?v=4" style="height:32px; width:32px;">
                    **${user.displayName}**
                    </dd>
                  </dl>`;
        console.log('user: ', user)
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
        this.setupEventHandlers()
      }
      else {
        console.log('logged out')
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
      knownProjects: this.knownProjects,
      systemInfo
    }
  },

  killWorkers() {
    console.log('clearing workers')
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
  },

  async updateWorkers(user) {
    let clientInfo = await this.getClientInfo(user)
    if (this.lockTailWorker) {
      console.log('sending to lockTailWorker: ')
      this.lockTailWorker.send({clientInfo})
    }
    if (this.saveWorker) {
      this.saveWorker.send({clientInfo})
    }
    console.log('updating workers', clientInfo)
  },


  async setupEventHandlers() {
    this.tokenUnsubscribe = fb.auth().onIdTokenChanged(async user => {
      if (user) {
        if (this.scriptsInstalled && !this.lockTailWorker) {
          this.lockTailWorker = threads.spawn('lock-tail-worker.js')
          .on('message', (message) => {
            let err = message ? message.err : {}
            if (err && (err.code === 'ENOTACQUIRED' || err.code === 'ELOCKED')) {
              return
            }
            // manually check if user needs new token... this shouldn't be necessary but firebase
            // isn't triggering "IDTokenChanged" events when manually refreshed via http from backend
            user.getIdToken().catch(e => {})
            console.log('lockTail: ', message);
          })
        }
        if (!this.saveWorker) {
          this.saveWorker = threads.spawn('save-worker.js')
          .on('message', (message) => {
            // manually check if user needs new token...
            user.getIdToken().catch(e => {})
            console.log('saveWorker: ', message);
          })
        }
        if (!this.subscriptions.add) {
          // if there is no ".add" then we aren't listening
          this.subscriptions = new CompositeDisposable
          atom.workspace.observeTextEditors( (editor) => {
            let buffer = editor.getBuffer();

            this.subscriptions.add(buffer.onDidSave((e) => {
              let file = buffer.file
              let filePath = file ? file.path : e.path
              console.log('save detected.. sending to worker ');
              this.saveWorker.send({filePath: filePath, text: buffer.getText()});
            }));
          });
          this.userProjectsRef = fb.database().ref(`/projects/${user.uid}`)
          this.userProjectsRef.on('value', async (snap) => {
            let projects = snap.val() || {}
            this.knownProjects = Object.values(projects).filter(project => project.isWatched)
            this.updateWorkers(user)
          })
        }
        this.updateWorkers(user)
      }
      else {
        console.log('deactivating')
        this.deactivate()
      }
    });

  },
}

function authenticate() {
  auth().then((resp, err) => {
    console.log(resp)
    let credential = fb.auth.GithubAuthProvider.credential(resp.accessToken)
    return fb.auth().signInWithCredential(credential).catch( (error) => {
      console.error(error);
    });
  })
}

function signOut() {
  fb.auth().signOut().then(() => {
    console.log('signed out')
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
