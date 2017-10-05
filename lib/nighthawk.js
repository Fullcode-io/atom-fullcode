'use babel';

import auth from './auth'
import {install_script} from './install_scripts'
const os = require('os');
const threads = require('threads')
const path = require('path');
const fs = require('fs-extra');
const AWS = require('aws-sdk');
const jsonfile = require('jsonfile');
const firebase = require("firebase");
const getRepoInfo = require('git-repo-info');
atom.firebase = firebase
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
  knownProjects: ['nighthawk-atom', 'nighthawk'],

  async activate (state) {
    console.log('STARING Nighthawk');

    this.systemInfo = os.userInfo()
    this.systemInfo['platform'] = process.platform
    this.systemInfo['release'] = os.release()
    this.systemInfo['versions'] = process.versions
    this.systemInfo['dirname'] = __dirname
    this.systemInfo['hostName'] = os.hostname()

    firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
        atom.notifications.addSuccess(`🐦 Nighthawk: Logged in as ${user.displayName}`, {
          buttons: [
            {text: 'Logout', onDidClick() { signOut(); }}
          ]
        });

        let isWindows = /^win/.test(process.platform)
        if (!isWindows) {
          let scriptsInstalled = await install_script()
          if (scriptsInstalled && (!this.lockTailWorker || this.lockTailWorker.slave.killed)) {
            this.lockTailWorker = threads.spawn('lock-tail.js').send(this.systemInfo)
          }
        }
        if (!this.saveWorker || this.saveWorker.slave.killed) {
          this.saveWorker = threads.spawn('save-compresser.js').send({systemInfo: this.systemInfo})
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

  killWorkers() {
    if (this.lockTailWorker) {
      this.lockTailWorker.kill().removeAllListeners()
    }
    if (this.saveWorker) {
      this.saveWorker.kill().removeAllListeners()
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
      this.lockTailWorker.on('message', (message) => {
        console.log('user: ', message);
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
          if (this.canSaveFile(filePath)) {
            console.log('save detected.. sending to worker ');
            this.saveWorker.send({filePath: filePath, text: buffer.getText()});
          }
        });
      });
    }
  },

  canSaveFile(filePath) {
    let shouldIgnore = false
    let gitInfo = getRepoInfo(this.systemInfo.dirname)
    let gitRoot = gitInfo.root
    let gitProject = gitRoot && this.knownProjects.includes(gitRoot.split(path.sep).pop())
    let knownProject = gitProject || this.knownProjects.some((project) => filePath.includes(`${path.sep}${project}${path.sep}`))
    if (fs.pathExistsSync(`${gitRoot}/.gitignore`)) {
      let gitIgnore = fs.readFileSync(`${gitRoot}/.gitignore`, {encoding: 'utf8'})
      let ignorables = gitIgnore.split(os.EOL).filter((ignorable) => ignorable != "")
      shouldIgnore = ignorables.some((ignoreMe) => filePath.includes(ignoreMe))
    }
    return knownProject && !shouldIgnore && !this.saveWorker.slave.killed
  }
};

streamToKinesis = (payload) => {
  console.log(payload);
  var date = new Date;
  var params = {
    PartitionKey: String(date.getTime()),
    StreamName: 'log-stream',
    Data: JSON.stringify(payload),
  };
  kinesis.putRecord(params, function (err, data) {
    if (err) {
      console.log(err, err.stack);
    } else {
      console.log('Success! ', data);
      // TODO: Remove/abstract below for just dev
      // Gets record that was just pushed and saves it for local testing
      var shardID = {
        ShardId: data.ShardId,
        ShardIteratorType: 'AT_SEQUENCE_NUMBER',
        StartingSequenceNumber: data.SequenceNumber,
        StreamName: 'log-stream',
      };
      kinesis.getShardIterator(shardID, function (err, shardIndex) {
        kinesis.getRecords({ ShardIterator: shardIndex.ShardIterator }, function (err, data) {
          if (err) {
            console.log(err, err.stack);
          } else {
            // TODO: Remove below... for dev only
            var homePath = process.env.HOME;
            var pathForTesting = homePath + '/projects/lambda-backend/event.json';
            var blob = data.Records[0].Data;
            var envelope = jsonfile.readFileSync(pathForTesting);
            envelope.Records[0].kinesis = Buffer(blob);
            jsonfile.writeFileSync(pathForTesting, envelope, { spaces: 2 });
            var exec = require('child_process').exec;
            var cmd = 'node-lambda run --handler main.handler';
            // node-lambda run --handler main.handler
            var options = { cwd: homePath + '/projects/lambda-backend/', timeout: 15000 };
            exec(cmd, options, function (err, stdout, stderr) {
              if (err) {console.log(err);}

              if (stdout) {console.log(stdout);}

              if (stderr) {console.log(stderr);}
            });
          }
        });
      });
    }
  });
};


setupKinesisStream = function () {
  return true;
  waitForStreamToBecomeActive('log-stream', function (err) {
    if (err) {
      console.error('Error connecting to stream: ' + err);
      return;
    }
    console.log('log-stream Active');
  });
};

function waitForStreamToBecomeActive(streamName, callback) {
  kinesis.describeStream({ StreamName: streamName },
    function (err, data) {
      if (err && err.code != 'UnknownEndpoint') {
        callback(err);
        return;
      } else if (!err && data.StreamDescription.StreamStatus === 'ACTIVE') {
        callback();
      }
      // The stream is not ACTIVE yet. Wait for another 5 seconds before
      // checking the state again.
      else {
        setTimeout(function () {
          console.log('waiting for stream to become active');
          waitForStreamToBecomeActive(streamName, callback);
        }, 10000);
      }
    }
  );
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
