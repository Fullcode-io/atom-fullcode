'use babel'

import _url from 'url';
import shell from 'shell';
import {BrowserWindow} from 'remote';

const authUrl = `https://nighthawk-1.firebaseapp.com/login`;
// const authUrl = `http://localhost:4200/login`;



function signIn() {
  return new Promise((resolve, reject) => {
    var win = new BrowserWindow({
      show: false, maxWidth: 800, maxHeight: 600, resizable: false,
        webPreferences: {
          nativeWindowOpen: true,
          allowRunningInsecureContent: true,
          nodeIntegration: false
        }
    });

    var {webContents} = win;

    // webContents.session.getCacheSize(function(r, s){
    // console.log(r)
    // console.log(s)
    // });
    //
    // webContents.session.clearCache(function(){
    //   console.log('cleared cache!')
    // });
    //
    // webContents.session.getCacheSize(function(r, s){
    // console.log(r)
    // console.log(s)
    // });

    // win.setSkipTaskbar(true);
    // win.setMenuBarVisibility(false);
    win.setTitle('Login to FullCode');

    webContents.on('did-finish-load', () => {
      win.show()
      // debugger;
      // win.webContents.openDevTools()
    });

    webContents.on('new-window', (e, url) => {
      console.log('new-window: ', url)
      e.preventDefault();
      win.destroy();
      shell.openExternal(url);
    });

    webContents.on('will-navigate', (e, url) => {
      console.log('navigating: ', url)
      if (url.includes('url?cred=')) {
        win.destroy();
        let creds = url.split('cred=')[1]
        resolve(JSON.parse(unescape(creds)))
      }
    });

    webContents.session.clearStorageData((r,s) => {
      console.log(r)
      console.log(s)
      console.log('cleared cache!')
      console.log('loading url')
      // let loadOptions = {extraHeaders: 'pragma: no-cache\n'}
      let loadOptions = {}
      // console.log(win)
      if (!win.loadURL(`${authUrl}`, loadOptions)) {
        atom.notifications.addWarning('Nighthawk: connectivity issue', {
          detail: `The editor is unable to connect to ${authUrl}. Are you connected to the internet?`,
          buttons: [
            {text: 'Try again', onDidClick() { signIn(); }}
          ]
        });
      }
    });

  })
}

export default () => {
  return signIn().catch(err => {
    console.error('FC sign in error: ',err)
  })
  // var existingToken = _token.get();
  // return (!existingToken) ? signIn() : confirmOauthToken(existingToken)
}
