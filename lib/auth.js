'use babel'

import _url from 'url';
import shell from 'shell';
import {BrowserWindow} from 'remote';

const authUrl = `http://localhost:4200/login`;

function signIn() {
  return new Promise((resolve, reject) => {
    var win = new BrowserWindow({
      show: false, width: 800, height: 600, resizable: true,
        webPreferences: {
          nativeWindowOpen: true,
          allowRunningInsecureContent: true,
          nodeIntegration: false
        }
    });

    var {webContents} = win;

    // win.setSkipTaskbar(true);
    // win.setMenuBarVisibility(false);
    win.setTitle('Welcome to Nighthawk');

    webContents.on('did-finish-load', () => {
      win.show()
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

    if (!win.loadURL(`${authUrl}`)) {
      atom.notifications.addWarning('Nighthawk: connectivity issue', {
        detail: `The editor is unable to connect to ${authUrl}. Are you connected to the internet?`,
        buttons: [
          {text: 'Try again', onDidClick() { signIn(); }}
        ]
      });
    }
  })
}

export default function() {
  return signIn()
  // var existingToken = _token.get();
  // return (!existingToken) ? signIn() : confirmOauthToken(existingToken)
}
